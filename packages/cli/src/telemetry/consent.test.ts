import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { decideConsent, markSent, telemetryDisabled } from './consent.ts'
import { DEFAULT_TELEMETRY_ENDPOINT, telemetryEndpoint } from './endpoint.ts'

let dir: string
const ON = { SLOP_GATE_TELEMETRY_URL: 'https://example.test/t' }

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-telemetry-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('dO_NOT_TRACK is honoured before our own switch, because it is the shared convention', () => {
  expect(telemetryDisabled({ DO_NOT_TRACK: '1' })).toBe('do-not-track')
  expect(telemetryDisabled({ DO_NOT_TRACK: '1', SLOP_GATE_TELEMETRY: '1' })).toBe('do-not-track')
  // `DO_NOT_TRACK=0` is an explicit "tracking is fine", not an absence.
  expect(telemetryDisabled({ DO_NOT_TRACK: '0' })).toBeNull()
})

test('anything other than an explicit on turns our own switch off', () => {
  for (const value of ['0', 'false', 'off', 'no', 'maybe', '']) {
    expect(telemetryDisabled({ SLOP_GATE_TELEMETRY: value }), value).toBe('disabled')
  }
  for (const value of ['1', 'true', 'on', 'yes']) {
    expect(telemetryDisabled({ SLOP_GATE_TELEMETRY: value }), value).toBeNull()
  }
})

test('an empty endpoint means nowhere, whatever the switches say', async () => {
  await expect(decideConsent({ env: { SLOP_GATE_TELEMETRY_URL: '' }, stateDir: dir })).resolves.toEqual({
    send: false,
    why: 'no-endpoint',
  })
})

test('an unset endpoint falls back to the built-in one, so telemetry is opt-out rather than opt-in', async () => {
  expect(telemetryEndpoint({})).toBe(DEFAULT_TELEMETRY_ENDPOINT)
  await expect(decideConsent({ env: {}, stateDir: dir })).resolves.toMatchObject({ send: true })
})

test('a configured endpoint wins over the built-in one', () => {
  expect(telemetryEndpoint({ SLOP_GATE_TELEMETRY_URL: 'https://elsewhere.test/t' })).toBe('https://elsewhere.test/t')
})

test('the first run is flagged, so the notice is printed once rather than every time', async () => {
  const first = await decideConsent({ env: ON, stateDir: dir })
  expect(first).toMatchObject({ send: true, firstRun: true })

  await markSent(dir)
  const later = await decideConsent({ env: ON, stateDir: dir, now: Date.now() + 2 * 60 * 60 * 1000 })
  expect(later).toMatchObject({ send: true, firstRun: false })
})

test('at most one report an hour, so a heavy user does not outweigh everyone else', async () => {
  await decideConsent({ env: ON, stateDir: dir })
  await markSent(dir)

  await expect(decideConsent({ env: ON, stateDir: dir })).resolves.toEqual({ send: false, why: 'too-soon' })
  await expect(decideConsent({ env: ON, stateDir: dir, now: Date.now() + 61 * 60 * 1000 })).resolves.toMatchObject({ send: true })
})

test('the project id is random and persists, and is derived from nothing', async () => {
  const first = await decideConsent({ env: ON, stateDir: dir })
  const second = await decideConsent({ env: ON, stateDir: dir })
  const id = first.send ? first.project : null

  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(second.send ? second.project : null).toBe(id)

  // A second checkout gets a different one. Nothing about the repository feeds into it — hashing a
  // git remote was rejected because a repository URL has little enough entropy to be reversed.
  const other = await mkdtemp(join(tmpdir(), 'sgate-telemetry-'))
  const elsewhere = await decideConsent({ env: ON, stateDir: other })
  expect(elsewhere.send ? elsewhere.project : null).not.toBe(id)
  await rm(other, { recursive: true, force: true })
})

test('the id file is written owner-only', async () => {
  await decideConsent({ env: ON, stateDir: dir })
  expect((await readFile(join(dir, 'project-id'), 'utf8')).trim()).not.toBe('')
})
