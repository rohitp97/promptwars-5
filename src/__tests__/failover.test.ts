// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const genai = vi.hoisted(() => ({ generateContent: vi.fn() }))
const fbase = vi.hoisted(() => ({ generateContent: vi.fn(), getGenerativeModel: vi.fn() }))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: genai.generateContent }
  },
}))
vi.mock('firebase/app', () => ({ initializeApp: () => ({}), getApps: () => [], getApp: () => ({}) }))
vi.mock('firebase/ai', () => ({
  getAI: () => ({}),
  getGenerativeModel: fbase.getGenerativeModel,
  GoogleAIBackend: class {},
}))

import {
  DEFAULT_MODELS,
  PER_MODEL_TIMEOUT_MS,
  createAiProvider,
  orderModels,
  readModels,
  resetModelPreference,
  withModelFailover,
} from '../lib/ai'

// Real error texts captured from Google while building this app.
const GONE =
  '[404 ] This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash. (AI/fetch-error)'
const BUSY =
  '[500 ] This model is currently experiencing high demand. Spikes in demand are usually temporary. (AI/fetch-error)'
const NOT_ENABLED =
  "AI: The Firebase AI SDK requires the Firebase AI API ('firebasevertexai.googleapis.com') to be enabled in your Firebase project. (AI/api-not-enabled)"
const FORBIDDEN =
  '[403 ] Firebase AI Logic API has not been used in project 1 before or it is disabled. PERMISSION_DENIED'

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetModelPreference()
  vi.unstubAllEnvs()
  for (const k of [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_GEMINI_API_KEY',
    'VITE_GEMINI_MODEL',
    'VITE_ALLOW_CLIENT_KEY',
    'VITE_USE_FIREBASE_AI',
  ]) {
    vi.stubEnv(k, '')
  }
  vi.clearAllMocks()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  warn.mockRestore()
})

describe('readModels', () => {
  it('defaults to a fallback chain, not a single model', () => {
    expect(readModels()).toEqual([...DEFAULT_MODELS])
    expect(DEFAULT_MODELS.length).toBeGreaterThanOrEqual(2)
    expect(new Set(DEFAULT_MODELS).size).toBe(DEFAULT_MODELS.length)
  })

  it('never defaults to a model already known to be retired for new projects', () => {
    expect(DEFAULT_MODELS).not.toContain('gemini-2.5-flash')
  })

  it('parses a comma-separated override, trimming spaces and dropping empties', () => {
    vi.stubEnv('VITE_GEMINI_MODEL', ' model-a , ,model-b,, ')
    expect(readModels()).toEqual(['model-a', 'model-b'])
  })

  it('accepts a single model, and treats a blank override as unset', () => {
    vi.stubEnv('VITE_GEMINI_MODEL', 'only-one')
    expect(readModels()).toEqual(['only-one'])
    vi.stubEnv('VITE_GEMINI_MODEL', '  ,  ')
    expect(readModels()).toEqual([...DEFAULT_MODELS])
  })

  it('returns a copy, so callers cannot mutate the defaults', () => {
    readModels().push('x')
    expect(readModels()).toEqual([...DEFAULT_MODELS])
  })
})

describe('withModelFailover', () => {
  it('returns the first success without touching the rest', async () => {
    const attempt = vi.fn(async (m: string) => `ok:${m}`)
    expect(await withModelFailover(['a', 'b', 'c'], attempt)).toBe('ok:a')
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a retired model (404)', GONE],
    ['an overloaded model (500)', BUSY],
    ['a rate limit (429)', '[429 ] Resource has been exhausted (e.g. check quota).'],
    ['an unavailable model (503)', '[503 ] The service is currently unavailable.'],
    ['a per-model timeout', 'The AI request timed out'],
  ])('moves on to the next model after %s', async (_label, message) => {
    const attempt = vi.fn(async (m: string) => {
      if (m === 'a') throw new Error(message)
      return `ok:${m}`
    })
    expect(await withModelFailover(['a', 'b'], attempt)).toBe('ok:b')
    expect(attempt.mock.calls.map((c) => c[0])).toEqual(['a', 'b'])
  })

  it('walks the whole chain in order until one works', async () => {
    const order: string[] = []
    const result = await withModelFailover(['a', 'b', 'c'], async (m) => {
      order.push(m)
      if (m !== 'c') throw new Error(BUSY)
      return 'ok:c'
    })
    expect(result).toBe('ok:c')
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it.each([
    ['API not enabled (SDK wording)', NOT_ENABLED],
    ['permission denied (403)', FORBIDDEN],
    ['an invalid API key', 'API key not valid. Please pass a valid API key.'],
    ['a malformed request (400)', '[400 ] Invalid JSON payload received.'],
  ])('does NOT try other models after %s: no model can fix a setup error', async (_label, message) => {
    const attempt = vi.fn(async () => {
      throw new Error(message)
    })
    await expect(withModelFailover(['a', 'b', 'c'], attempt)).rejects.toThrow(message)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('throws the LAST error when every model fails', async () => {
    const attempt = vi.fn(async (m: string) => {
      throw new Error(m === 'a' ? GONE : BUSY)
    })
    await expect(withModelFailover(['a', 'b'], attempt)).rejects.toThrow(/high demand/)
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('does not fail over when there is only one model', async () => {
    const attempt = vi.fn(async () => {
      throw new Error(BUSY)
    })
    await expect(withModelFailover(['only'], attempt)).rejects.toThrow(/high demand/)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('fails over from a model that hangs, after the per-model timeout', async () => {
    vi.useFakeTimers()
    try {
      const attempt = vi.fn((m: string) => (m === 'slow' ? new Promise<string>(() => {}) : Promise.resolve(`ok:${m}`)))
      const pending = withModelFailover(['slow', 'fast'], attempt)
      await vi.advanceTimersByTimeAsync(PER_MODEL_TIMEOUT_MS + 10)
      expect(await pending).toBe('ok:fast')
    } finally {
      vi.useRealTimers()
    }
  })

  it('logs the switch for the operator, with the model names and no notice text', async () => {
    await withModelFailover(['a', 'b'], async (m) => {
      if (m === 'a') throw new Error(GONE)
      return 'ok'
    })
    expect(warn).toHaveBeenCalledTimes(1)
    const line = warn.mock.calls.flat().join(' ')
    expect(line).toContain('model a failed, trying b')
    expect(line.length).toBeLessThan(400)
  })
})

describe('remembering the model that worked', () => {
  it('starts with the configured order when nothing has worked yet', () => {
    expect(orderModels(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('starts the NEXT request on the model that last answered, skipping the dead ones', async () => {
    const first: string[] = []
    await withModelFailover(['a', 'b', 'c'], async (m) => {
      first.push(m)
      if (m !== 'c') throw new Error(BUSY)
      return 'ok'
    })
    expect(first).toEqual(['a', 'b', 'c'])

    const second: string[] = []
    await withModelFailover(['a', 'b', 'c'], async (m) => {
      second.push(m)
      return 'ok'
    })
    expect(second).toEqual(['c'])
  })

  it('keeps the remaining models as backups, in their original order', async () => {
    await withModelFailover(['a', 'b', 'c'], async (m) => {
      if (m === 'a') throw new Error(BUSY)
      return 'ok:b'
    })
    expect(orderModels(['a', 'b', 'c'])).toEqual(['b', 'a', 'c'])
  })

  it('moves on again if the remembered model later fails', async () => {
    await withModelFailover(['a', 'b'], async (m) => {
      if (m === 'a') throw new Error(BUSY)
      return 'ok'
    })
    const tried: string[] = []
    const out = await withModelFailover(['a', 'b'], async (m) => {
      tried.push(m)
      if (m === 'b') throw new Error(BUSY)
      return `ok:${m}`
    })
    expect(tried).toEqual(['b', 'a'])
    expect(out).toBe('ok:a')
    expect(orderModels(['a', 'b'])[0]).toBe('a')
  })

  it('does not remember a model that failed, or one that is not in the configured list', async () => {
    await expect(
      withModelFailover(['a'], async () => {
        throw new Error(BUSY)
      }),
    ).rejects.toThrow()
    expect(orderModels(['a', 'b'])).toEqual(['a', 'b'])
    await withModelFailover(['x'], async () => 'ok')
    expect(orderModels(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('can be reset', async () => {
    await withModelFailover(['a', 'b'], async (m) => {
      if (m === 'a') throw new Error(BUSY)
      return 'ok'
    })
    resetModelPreference()
    expect(orderModels(['a', 'b'])).toEqual(['a', 'b'])
  })
})

describe('providers use the chain', () => {
  it('direct-key provider retries the next model after a 404', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'k')
    vi.stubEnv('VITE_GEMINI_MODEL', 'gone-model,good-model')
    genai.generateContent.mockImplementation(async ({ model }: { model: string }) => {
      if (model === 'gone-model') throw new Error(GONE)
      return { text: '{"ok":true}' }
    })
    const out = await createAiProvider()!.generate({ systemInstruction: 's', prompt: 'p', json: true })
    expect(out).toBe('{"ok":true}')
    expect(genai.generateContent.mock.calls.map((c) => c[0].model)).toEqual(['gone-model', 'good-model'])
  })

  it('Firebase provider builds a fresh model per attempt and fails over', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'k')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'p')
    vi.stubEnv('VITE_FIREBASE_APP_ID', 'a')
    vi.stubEnv('VITE_GEMINI_MODEL', 'busy-model,good-model')
    fbase.getGenerativeModel.mockImplementation((_ai: unknown, params: { model: string }) => ({
      generateContent: async () => {
        if (params.model === 'busy-model') throw new Error(BUSY)
        return { response: { text: () => '{"from":"good"}' } }
      },
    }))
    const out = await createAiProvider()!.generate({ systemInstruction: 's', prompt: 'p', json: true })
    expect(out).toBe('{"from":"good"}')
    expect(fbase.getGenerativeModel.mock.calls.map((c) => c[1].model)).toEqual(['busy-model', 'good-model'])
  })

  it('surfaces a setup error immediately instead of cycling through models', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'k')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'p')
    vi.stubEnv('VITE_FIREBASE_APP_ID', 'a')
    fbase.getGenerativeModel.mockReturnValue({
      generateContent: async () => {
        throw new Error(NOT_ENABLED)
      },
    })
    await expect(createAiProvider()!.generate({ systemInstruction: 's', prompt: 'p', json: true })).rejects.toThrow(
      /api-not-enabled/,
    )
    expect(fbase.getGenerativeModel).toHaveBeenCalledTimes(1)
  })
})
