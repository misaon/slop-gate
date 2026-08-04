import { compareStrings, type ByteRange, type RawDiagnostic, type RawSeverity } from '@misaon/slop-gate-core'
import type { AdvisoryRecord, AdvisorySeverity, AdvisoryTable } from './advisory.ts'
import { advisoryAffects } from './match.ts'
import { manifestDependencies, type LockfileKind, type ParsedLockfile, type ResolvedPackage } from './lockfile.ts'
import { findDependencyRange } from './manifest.ts'
import { advisoryUrl, type DepsSecurityRuleId } from './rules.ts'
import { describeStaleness, snapshotAgeInDays, stalenessBand, type SnapshotManifest } from './snapshot.ts'

export type PackageManifest = {
  readonly file: string
  readonly source: string
}

export type ScanInput = {
  readonly lockfile: { readonly file: string; readonly kind: LockfileKind }
  readonly parsed: ParsedLockfile
  readonly manifests: readonly PackageManifest[]
  readonly vulnerable: AdvisoryTable
  readonly malicious: AdvisoryTable
  readonly snapshot: SnapshotManifest
  readonly enabled: ReadonlySet<DepsSecurityRuleId>
  readonly unsupportedLockfiles?: readonly { readonly file: string; readonly manager: string }[]
  readonly now?: Date
}

const RAW_SEVERITY: Readonly<Record<AdvisorySeverity, RawSeverity>> = {
  LOW: 'info',
  MODERATE: 'warning',
  HIGH: 'error',
  CRITICAL: 'error',
}

export function scanDependencies(input: ScanInput): readonly RawDiagnostic[] {
  const out: RawDiagnostic[] = []
  const locate = anchorFor(input)

  if (input.enabled.has('vulnerability')) {
    out.push(...matches(input, input.vulnerable, 'vulnerability', locate))
  }
  if (input.enabled.has('malware')) {
    out.push(...matches(input, input.malicious, 'malware', locate))
  }
  if (input.enabled.has('missing-lockfile-entry')) {
    out.push(...missingFromLockfile(input))
  }
  if (input.enabled.has('coverage-gap')) {
    out.push(...coverageGaps(input))
  }

  return out.sort(
    (left, right) =>
      compareStrings(left.file, right.file) ||
      left.range.start - right.range.start ||
      compareStrings(left.engineRuleId, right.engineRuleId) ||
      compareStrings(left.message, right.message),
  )
}

type Anchor = { readonly file: string; readonly range: ByteRange }

function anchorFor(input: ScanInput): (path: readonly string[]) => Anchor {
  const lockfileAnchor: Anchor = { file: input.lockfile.file, range: { start: 0, end: 0 } }
  const cache = new Map<string, Anchor>()

  return (path) => {
    const root = path[0]
    if (root === undefined) return lockfileAnchor
    const cached = cache.get(root)
    if (cached !== undefined) return cached

    let anchor = lockfileAnchor
    for (const manifest of input.manifests) {
      const range = findDependencyRange(manifest.source, root)
      if (range !== undefined) {
        anchor = { file: manifest.file, range }
        break
      }
    }
    cache.set(root, anchor)
    return anchor
  }
}

function* matches(
  input: ScanInput,
  table: AdvisoryTable,
  rule: Extract<DepsSecurityRuleId, 'vulnerability' | 'malware'>,
  locate: (path: readonly string[]) => Anchor,
): Generator<RawDiagnostic> {
  const seen = new Set<string>()

  for (const installed of input.parsed.packages) {
    for (const advisory of table[installed.name] ?? []) {
      if (!advisoryAffects(installed.version, advisory)) continue
      const key = `${installed.name}@${installed.version}\0${advisory.id}`
      if (seen.has(key)) continue
      seen.add(key)

      const anchor = locate(installed.path)
      yield {
        engineRuleId: rule,
        message: describe(rule, installed, advisory),
        severity: rule === 'malware' ? 'error' : (RAW_SEVERITY[advisory.severity ?? 'MODERATE'] ?? 'warning'),
        file: anchor.file,
        range: anchor.range,
        docsUrl: advisoryUrl(advisory.id),
        help: remedy(rule, installed),
      }
    }
  }
}

function describe(rule: 'vulnerability' | 'malware', installed: ResolvedPackage, advisory: AdvisoryRecord): string {
  const subject = `${installed.name}@${installed.version}`
  const chain = installed.path.length > 1 ? ` (pulled in through ${installed.path.join(' › ')})` : ''
  const summary = advisory.summary === '' ? '' : ` — ${advisory.summary}`

  if (rule === 'malware') {
    return `${subject} is a published release of a package recorded as malicious, ${advisory.id}${chain}${summary}`
  }
  const severity = advisory.severity === null ? '' : ` [${advisory.severity.toLowerCase()}]`
  return `${subject} is affected by ${advisory.id}${severity}${chain}${summary}`
}

function remedy(rule: 'vulnerability' | 'malware', installed: ResolvedPackage): string {
  const root = installed.path[0]
  if (rule === 'malware') {
    return `Remove this version and audit anything it had access to — credentials in the environment it installed under should be treated as disclosed.${
      root === undefined ? '' : ` It is reached through \`${root}\`.`
    }`
  }
  return root === undefined || root === installed.name
    ? `Upgrade \`${installed.name}\` past the affected range.`
    : `\`${installed.name}\` is a transitive dependency; upgrading \`${root}\` is usually what moves it.`
}

function* missingFromLockfile(input: ScanInput): Generator<RawDiagnostic> {
  for (const manifest of input.manifests) {
    for (const dependency of manifestDependencies(manifest.source)) {
      if (input.parsed.directNames.has(dependency.name)) continue
      const range = findDependencyRange(manifest.source, dependency.name) ?? { start: 0, end: 0 }
      yield {
        engineRuleId: 'missing-lockfile-entry',
        message:
          `\`${dependency.name}@${dependency.range}\` is declared in ${dependency.group} but ${input.lockfile.file} resolved no such package. ` +
          'Either it does not exist on the registry, or the lockfile predates the edit that added it.',
        severity: 'warning',
        file: manifest.file,
        range,
        help: `Run your package manager's install to find out which: it will resolve the entry, or fail naming it. Note that an unresolvable \`optionalDependencies\` entry does *not* fail the install, which is how one reaches a committed lockfile.`,
      }
    }
  }
}

function* coverageGaps(input: ScanInput): Generator<RawDiagnostic> {
  const days = snapshotAgeInDays(input.snapshot, input.now ?? new Date())
  if (stalenessBand(days) !== 'fresh') {
    yield {
      engineRuleId: 'coverage-gap',
      message: describeStaleness(days),
      severity: 'warning',
      file: input.lockfile.file,
      range: { start: 0, end: 0 },
      help: `The snapshot was taken from ${input.snapshot.source} on ${input.snapshot.fetchedAt}.`,
    }
  }

  for (const unsupported of input.unsupportedLockfiles ?? []) {
    yield {
      engineRuleId: 'coverage-gap',
      message:
        `${unsupported.file} is a ${unsupported.manager} lockfile, which this engine cannot read — ` +
        `no dependency locked by it was checked against the advisory database.`,
      severity: 'warning',
      file: unsupported.file,
      range: { start: 0, end: 0 },
      help: `Only npm (\`package-lock.json\`, \`npm-shrinkwrap.json\`) and pnpm (\`pnpm-lock.yaml\`) lockfiles are read today.`,
    }
  }
}
