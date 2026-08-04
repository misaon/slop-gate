import { describe, expect, it } from 'vitest'
import { buildAdvisoryTables, distillAdvisory } from './advisory.ts'
import { advisoryAffects } from './match.ts'

const npmPackage = (name: string) => ({ name, ecosystem: 'npm' })

const chalk = {
  id: 'MAL-2025-46969',
  summary: 'Malicious code in chalk (npm)',
  affected: [{ package: npmPackage('chalk'), versions: ['5.6.1'] }],
}

const hono = {
  id: 'GHSA-2234-fmw7-43wr',
  summary: 'Hono allows bypass of CSRF Middleware',
  database_specific: { severity: 'MODERATE' },
  affected: [
    { package: npmPackage('hono'), ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.6.5' }] }] },
  ],
}

const only = (document: unknown) => {
  const distilled = distillAdvisory(document)
  expect(distilled).toHaveLength(1)
  return distilled[0]!
}

describe('distillAdvisory', () => {
  it('reads an explicit version enumeration and does not widen it to the whole package', () => {
    const { kind, packageName, record } = only(chalk)

    expect(kind).toBe('malicious')
    expect(packageName).toBe('chalk')
    expect(record.versions).toEqual(['5.6.1'])
    expect(record.ranges).toEqual([])

    expect(advisoryAffects('5.6.1', record)).toBe(true)
    for (const safe of ['5.3.0', '5.6.0', '5.6.2', '4.1.2', '2.4.2']) {
      expect(advisoryAffects(safe, record)).toBe(false)
    }
  })

  it('flattens an introduced/fixed event pair into a half-open range', () => {
    const { kind, record } = only(hono)

    expect(kind).toBe('vulnerable')
    expect(record.severity).toBe('MODERATE')
    expect(record.ranges).toEqual([{ introduced: '0', bound: '4.6.5', kind: 'lt' }])
    expect(advisoryAffects('4.6.4', record)).toBe(true)
    expect(advisoryAffects('4.6.5', record)).toBe(false)
  })

  it('leaves a range with no closing event open', () => {
    const { record } = only({
      id: 'MAL-2021-1',
      affected: [{ package: npmPackage('cxp-jquery'), ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }] }] }],
    })

    expect(record.ranges).toEqual([{ introduced: '0', bound: null, kind: 'lt' }])
    expect(advisoryAffects('0.0.1', record)).toBe(true)
    expect(advisoryAffects('99.0.0', record)).toBe(true)
  })

  it('treats last_affected as inclusive and fixed as exclusive', () => {
    const { record } = only({
      id: 'GHSA-last-affected',
      affected: [
        {
          package: npmPackage('axios'),
          ranges: [{ type: 'SEMVER', events: [{ introduced: '0.8.1' }, { last_affected: '0.31.0' }] }],
        },
      ],
    })

    expect(advisoryAffects('0.31.0', record)).toBe(true)
    expect(advisoryAffects('0.31.1', record)).toBe(false)
    expect(advisoryAffects('0.8.0', record)).toBe(false)
  })

  it('unions an enumeration with the ranges beside it', () => {
    const { record } = only({
      id: 'MAL-both',
      affected: [
        {
          package: npmPackage('both'),
          versions: ['9.9.9'],
          ranges: [{ type: 'SEMVER', events: [{ introduced: '1.0.0' }, { fixed: '2.0.0' }] }],
        },
      ],
    })

    expect(advisoryAffects('9.9.9', record)).toBe(true)
    expect(advisoryAffects('1.5.0', record)).toBe(true)
    expect(advisoryAffects('3.0.0', record)).toBe(false)
  })

  it('drops a withdrawn advisory', () => {
    expect(distillAdvisory({ ...chalk, withdrawn: '2025-09-10T00:00:00Z' })).toEqual([])
  })

  it('drops an affected entry carrying neither versions nor ranges', () => {
    expect(distillAdvisory({ id: 'GHSA-empty', affected: [{ package: npmPackage('ghost-entry') }] })).toEqual([])
  })

  it('ignores ecosystems other than npm', () => {
    expect(
      distillAdvisory({ id: 'GHSA-pypi', affected: [{ package: { name: 'requests', ecosystem: 'PyPI' }, versions: ['2.0.0'] }] }),
    ).toEqual([])
  })

  it('skips non-SEMVER ranges rather than comparing them as semver', () => {
    expect(
      distillAdvisory({
        id: 'GHSA-ecosystem',
        affected: [
          { package: npmPackage('weird'), ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '0' }, { fixed: '2' }] }] },
        ],
      }),
    ).toEqual([])
  })

  it('splits an advisory naming several packages into one record each', () => {
    const distilled = distillAdvisory({
      id: 'GHSA-multi',
      affected: [
        { package: npmPackage('left'), versions: ['1.0.0'] },
        { package: npmPackage('right'), versions: ['2.0.0'] },
      ],
    })

    expect(distilled.map((entry) => entry.packageName)).toEqual(['left', 'right'])
  })

  it('rejects a severity string that is not one of OSV’s four', () => {
    expect(only({ ...hono, database_specific: { severity: 'SEVERE' } }).record.severity).toBeNull()
  })
})

describe('buildAdvisoryTables', () => {
  it('groups by package and separates the two kinds', () => {
    const tables = buildAdvisoryTables([...distillAdvisory(chalk), ...distillAdvisory(hono)])

    expect(Object.keys(tables.malicious)).toEqual(['chalk'])
    expect(Object.keys(tables.vulnerable)).toEqual(['hono'])
  })

  it('orders packages and ids so a rebuild of unchanged data is byte-identical', () => {
    const make = (id: string, name: string) => distillAdvisory({ id, affected: [{ package: npmPackage(name), versions: ['1.0.0'] }] })
    const forward = buildAdvisoryTables([...make('GHSA-b', 'zeta'), ...make('GHSA-a', 'zeta'), ...make('GHSA-c', 'alpha')]).vulnerable
    const reverse = buildAdvisoryTables([...make('GHSA-c', 'alpha'), ...make('GHSA-a', 'zeta'), ...make('GHSA-b', 'zeta')]).vulnerable

    expect(Object.keys(forward)).toEqual(['alpha', 'zeta'])
    expect(forward['zeta']?.map((record) => record.id)).toEqual(['GHSA-a', 'GHSA-b'])
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reverse))
  })
})

describe('advisoryAffects', () => {
  it('orders prereleases below the release they precede', () => {
    const { record } = only(hono)
    expect(advisoryAffects('4.6.5-rc.1', record)).toBe(true)
  })

  it('reports nothing for a version it cannot read as semver', () => {
    const { record } = only({
      id: 'MAL-open',
      affected: [{ package: npmPackage('anything'), ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }] }] }],
    })

    expect(advisoryAffects('not-a-version', record)).toBe(false)
    expect(advisoryAffects('', record)).toBe(false)
  })
})
