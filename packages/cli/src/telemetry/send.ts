import type { TelemetryPayload } from '@misaon/slop-gate-core'

// No retry, a hard timeout, every error swallowed: a gate that hung because telemetry was down would be
// a worse tool than one that collects nothing.
const TIMEOUT_MS = 2000
const MAX_BYTES = 64 * 1024

export type SendResult = 'sent' | 'too-large' | 'failed'

export async function sendTelemetry(endpoint: string, payload: TelemetryPayload): Promise<SendResult> {
  const body = JSON.stringify(payload)
  if (Buffer.byteLength(body) > MAX_BYTES) return 'too-large'

  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: controller.signal,
      // Nothing about the sender travels with the request beyond what the payload carries.
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
    })
    return response.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  } finally {
    clearTimeout(deadline)
  }
}
