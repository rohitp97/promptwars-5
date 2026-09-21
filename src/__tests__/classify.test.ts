// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSamples } from '../data/samples'
import { analyseNotice, classify } from '../lib/pipeline'
import type { AiProvider } from '../types'

// The literal message Google returned when AI Logic was not yet enabled on the project.
const GOOGLE_403 =
  'Firebase AI Logic API has not been used in project 360101983865 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/firebasevertexai.googleapis.com/overview?project=360101983865 then retry.'

// The Firebase SDK wraps that same failure in its own wording; captured from a real run.
const SDK_NOT_ENABLED =
  "AI: The Firebase AI SDK requires the Firebase AI API ('firebasevertexai.googleapis.com') to be enabled in your Firebase project. Enable this API by visiting the Firebase Console at https://console.firebase.google.com/project/promptwars-5/ailogic/ and clicking \"Get started\". If you enabled this API recently, wait a few minutes for the action to propagate to our systems and then retry. (AI/api-not-enabled)"

describe('classify', () => {
  it.each([
    [GOOGLE_403, 'config'],
    [SDK_NOT_ENABLED, 'config'],
    ['AI: The Firebase AI SDK could not find an API key (AI/no-api-key)', 'config'],
    ['AI: Firebase project ID is missing (AI/no-project-id)', 'config'],
    ['AI: Firebase app ID is missing (AI/no-app-id)', 'config'],
    ['[403] Requests from referer <empty> are blocked. PERMISSION_DENIED', 'config'],
    ['API key not valid. Please pass a valid API key.', 'config'],
    ['[401] Request had invalid authentication credentials (UNAUTHENTICATED)', 'config'],
    ['The Generative Language API is not enabled for this project', 'config'],
    ['[429] Resource has been exhausted (e.g. check quota).', 'quota'],
    ['RESOURCE_EXHAUSTED: rate limit reached', 'quota'],
    ['The AI request timed out', 'timeout'],
    ['[500 ] This model is currently experiencing high demand. Spikes in demand are usually temporary.', 'busy'],
    ['[503 ] The service is currently unavailable.', 'busy'],
    ['The model is overloaded. Please try again later.', 'busy'],
    ['[404 ] This model models/gemini-2.5-flash is no longer available to new users.', 'unavailable'],
    ['The AI response did not match the expected shape', 'format'],
    ['ECONNRESET something', 'unavailable'],
    ['', 'unavailable'],
  ])('classifies %j as %s', (message, expected) => {
    expect(classify(new Error(message))).toBe(expected)
  })

  it('treats a JSON SyntaxError as a format problem and non-Error throws as unavailable', () => {
    expect(classify(new SyntaxError('Unexpected token'))).toBe('format')
    expect(classify('boom')).toBe('unavailable')
    expect(classify(undefined)).toBe('unavailable')
    expect(classify(null)).toBe('unavailable')
  })

  it('does not mistake a number that merely contains 403 for an auth error', () => {
    expect(classify(new Error('Processed 14031 tokens'))).toBe('unavailable')
  })
})

describe('analyseNotice on a configuration failure', () => {
  const NOW = new Date(2026, 8, 21, 10, 0)
  const text = buildSamples('2026-09-21')[0].text
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => warn.mockRestore())

  const failing = (message: string): AiProvider & { calls: number } => {
    const p = { name: 'firebase-ai-logic' as const, calls: 0, generate: async (): Promise<string> => { p.calls++; throw new Error(message) } }
    return p
  }

  it('does not retry, and says the service may not be enabled', async () => {
    const p = failing(GOOGLE_403)
    const r = await analyseNotice(text, { receivedOn: '2026-09-19', language: 'auto' }, { provider: p, now: () => NOW })
    expect(p.calls).toBe(1)
    expect(r.source).toBe('fallback')
    expect(r.fallbackReason).toMatch(/may not be enabled/)
    expect(r.deadlines.some((d) => d.origin === 'notice')).toBe(true)
  })

  it('does not retry the Firebase SDK wrapper for "API not enabled" either', async () => {
    const p = failing(SDK_NOT_ENABLED)
    const r = await analyseNotice(text, { receivedOn: '2026-09-19', language: 'auto' }, { provider: p, now: () => NOW })
    expect(p.calls).toBe(1)
    expect(r.fallbackReason).toMatch(/may not be enabled/)
  })

  it('does not retry an outage: the AI layer already failed over across models', async () => {
    const p = failing('ECONNRESET')
    await analyseNotice(text, { receivedOn: '2026-09-19', language: 'auto' }, { provider: p, now: () => NOW })
    expect(p.calls).toBe(1)
  })

  it('says the service is busy when every model was overloaded, and does not retry', async () => {
    const p = failing('[500 ] This model is currently experiencing high demand. (AI/fetch-error)')
    const r = await analyseNotice(text, { receivedOn: '2026-09-19', language: 'auto' }, { provider: p, now: () => NOW })
    expect(p.calls).toBe(1)
    expect(r.fallbackReason).toMatch(/very busy/)
    expect(r.source).toBe('fallback')
  })

  it('still retries once when the answer itself was malformed', async () => {
    let n = 0
    const p: AiProvider = { name: 'firebase-ai-logic', generate: async () => (++n === 1 ? 'not json' : 'still not json') }
    await analyseNotice(text, { receivedOn: '2026-09-19', language: 'auto' }, { provider: p, now: () => NOW })
    expect(n).toBe(2)
  })

  it('logs the cause for the operator but never the notice text', async () => {
    await analyseNotice(text, { receivedOn: '2026-09-19', language: 'auto' }, { provider: failing(GOOGLE_403), now: () => NOW })
    expect(warn).toHaveBeenCalledTimes(1)
    const logged = warn.mock.calls.flat().join(' ')
    expect(logged).toContain('config')
    expect(logged).toContain('has not been used')
    expect(logged).not.toContain('Priya Iyer')
    expect(logged).not.toContain('LEGAL NOTICE')
  })

  it('does not show the raw provider error to the person', async () => {
    const r = await analyseNotice(text, { receivedOn: '2026-09-19', language: 'auto' }, { provider: failing(GOOGLE_403), now: () => NOW })
    expect(r.fallbackReason).not.toContain('360101983865')
    expect(r.fallbackReason).not.toContain('console.developers.google.com')
  })
})
