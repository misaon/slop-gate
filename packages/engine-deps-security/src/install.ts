import { createHash } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildAdvisoryTables, distillAdvisory, type AdvisoryTable, type DistilledAffected } from './advisory.ts'
import {
  MALICIOUS_FILE,
  SNAPSHOT_MANIFEST_FILENAME,
  SNAPSHOT_FORMAT_VERSION,
  VULNERABLE_FILE,
  advisorySnapshotDir,
  type SnapshotLocationOptions,
  type SnapshotManifest,
} from './snapshot.ts'
import { readZipEntries } from './zip.ts'

/**
 * OSV's per-ecosystem export. Everything the npm ecosystem has: GitHub's reviewed advisories and the
 * OpenSSF malicious-packages feed, already normalised into one schema and with withdrawals marked.
 *
 * **There is no digest to pin it against, and spec §19 is amended rather than quietly broken.** The
 * object is regenerated daily — the `ETag` changes with it — so upstream publishes nothing like
 * actionlint's `checksums.txt` and no committed SHA-256 could ever match. What is recorded instead is
 * the digest of the bytes this machine actually fetched, which makes a snapshot reproducible between
 * machines and tamper-evident on disk, and proves nothing whatsoever about the publisher.
 */
export const OSV_NPM_ARCHIVE_URL = 'https://osv-vulnerabilities.storage.googleapis.com/npm/all.zip'

export class AdvisoryInstallError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AdvisoryInstallError'
  }
}

export type InstallAdvisoriesOptions = SnapshotLocationOptions & {
  source?: string
  /** Injected in tests. Production uses the global `fetch`. */
  fetch?: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>
  now?: Date
  signal?: AbortSignal
}

export type InstallAdvisoriesResult = {
  readonly directory: string
  readonly manifest: SnapshotManifest
  readonly vulnerablePackages: number
  readonly maliciousPackages: number
}

/**
 * The only thing in this package that touches the network, and it is never on the path of a
 * `sgate check` — the same narrowing of D3 that `sgate engines install actionlint` records, for the
 * same reason: `Engine.availability` is filesystem-only, and availability is what decides whether a
 * first use ever happens. So a check on an air-gapped machine reports a coverage gap naming this
 * command rather than failing mid-run, and `npm audit`'s behaviour of exiting 0 with an empty report
 * when it cannot reach the registry has no analogue here.
 *
 * The 213 MB archive is distilled to roughly 18 MB on disk. The discarded 95% is prose — advisory
 * details, references, CWE lists — none of which a version match needs.
 */
export async function installAdvisorySnapshot(options: InstallAdvisoriesOptions = {}): Promise<InstallAdvisoriesResult> {
  const source = options.source ?? OSV_NPM_ARCHIVE_URL
  const fetchImpl = options.fetch ?? ((url: string) => fetch(url, options.signal === undefined ? {} : { signal: options.signal }))

  let archive: Uint8Array
  try {
    const response = await fetchImpl(source)
    if (!response.ok) throw new AdvisoryInstallError(`${source} responded ${response.status}`)
    archive = new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    if (error instanceof AdvisoryInstallError) throw error
    throw new AdvisoryInstallError(`could not download ${source}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }

  const digest = createHash('sha256').update(archive).digest('hex')
  const tables = buildAdvisoryTables(readAdvisories(archive, source))

  const manifest: SnapshotManifest = {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    source,
    fetchedAt: (options.now ?? new Date()).toISOString(),
    digest,
    vulnerableAdvisories: countAdvisories(tables.vulnerable),
    maliciousAdvisories: countAdvisories(tables.malicious),
  }

  if (manifest.vulnerableAdvisories === 0) {
    // A snapshot with no vulnerability data would make every repository read as clean — the exact
    // silent false negative this engine was built to avoid. Far likelier to mean the archive layout
    // changed than that npm has no advisories, so it refuses rather than installing a snapshot that
    // would make the tool lie quietly.
    throw new AdvisoryInstallError(
      `${source} was read successfully but produced no npm vulnerability advisories. Refusing to install a snapshot that would report every repository clean.`,
    )
  }

  const directory = advisorySnapshotDir(options)
  await writeAdvisorySnapshot(directory, manifest, tables)

  return {
    directory,
    manifest,
    vulnerablePackages: Object.keys(tables.vulnerable).length,
    maliciousPackages: Object.keys(tables.malicious).length,
  }
}

function* readAdvisories(archive: Uint8Array, source: string): Generator<DistilledAffected> {
  const decoder = new TextDecoder()
  let seen = 0
  for (const entry of readZipEntries(archive)) {
    if (!entry.name.endsWith('.json')) continue
    seen++
    let document: unknown
    try {
      document = JSON.parse(decoder.decode(entry.data))
    } catch {
      // One malformed document out of 224,000 is not a reason to abandon the other 223,999, and the
      // empty-result guard above is what catches a layout change that breaks all of them at once.
      continue
    }
    yield* distillAdvisory(document)
  }
  if (seen === 0) throw new AdvisoryInstallError(`${source} contains no advisory documents`)
}

function countAdvisories(table: Record<string, readonly { id: string }[]>): number {
  const ids = new Set<string>()
  for (const records of Object.values(table)) for (const record of records) ids.add(record.id)
  return ids.size
}

/**
 * Writes a snapshot to an arbitrary directory. Exported because building one somewhere other than
 * the default cache is a real workflow rather than a test hook: an air-gapped image cannot run
 * `sgate engines install advisories` at all, so it has to bake a snapshot in at build time and point
 * `SLOP_GATE_ADVISORIES_PATH` at it.
 *
 * Written to a staging directory and moved into place, so a `check` running concurrently sees either
 * the previous snapshot or the new one and never a half-written index. Within the staging directory
 * the manifest is written last, for the same reason at a finer grain: `readSnapshotManifest` is what
 * `availability()` consults, so a directory without it is simply "not installed".
 */
export async function writeAdvisorySnapshot(
  directory: string,
  manifest: SnapshotManifest,
  tables: { readonly vulnerable: AdvisoryTable; readonly malicious: AdvisoryTable },
): Promise<void> {
  const staging = `${directory}.${process.pid}.partial`
  try {
    await rm(staging, { recursive: true, force: true })
    await mkdir(staging, { recursive: true })
    await writeFile(join(staging, VULNERABLE_FILE), JSON.stringify(tables.vulnerable), 'utf8')
    await writeFile(join(staging, MALICIOUS_FILE), JSON.stringify(tables.malicious), 'utf8')
    await writeFile(join(staging, SNAPSHOT_MANIFEST_FILENAME), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

    await mkdir(join(directory, '..'), { recursive: true })
    await rm(directory, { recursive: true, force: true })
    await rename(staging, directory)
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw new AdvisoryInstallError(`could not write the advisory snapshot to ${directory}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}
