// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const genai = vi.hoisted(() => ({ generateContent: vi.fn(), ctorArgs: [] as unknown[] }))
const fbase = vi.hoisted(() => ({
  generateContent: vi.fn(),
  getGenerativeModel: vi.fn(),
  getAI: vi.fn(),
  initializeApp: vi.fn(),
  getApps: vi.fn(),
  getApp: vi.fn(),
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: genai.generateContent }
    constructor(opts: unknown) {
      genai.ctorArgs.push(opts)
    }
  },
}))

vi.mock('firebase/app', () => ({
  initializeApp: fbase.initializeApp,
  getApps: fbase.getApps,
  getApp: fbase.getApp,
}))

vi.mock('firebase/ai', () => ({
  getAI: fbase.getAI,
  getGenerativeModel: fbase.getGenerativeModel,
  GoogleAIBackend: class GoogleAIBackend {},
}))

import { DEFAULT_MODELS, createAiProvider, resetModelPreference } from '../lib/ai'

const FIREBASE_ENV = { VITE_FIREBASE_API_KEY: 'fb-key', VITE_FIREBASE_PROJECT_ID: 'proj', VITE_FIREBASE_APP_ID: '1:2:web:3' }

const request = { systemInstruction: 'SYS', prompt: 'PROMPT', json: true }

beforeEach(() => {
  resetModelPreference()
  vi.unstubAllEnvs()
  // Blank EVERY variable the provider reads, so the tests never depend on a developer's real .env.
  for (const k of [
    'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_GEMINI_API_KEY', 'VITE_ALLOW_CLIENT_KEY', 'VITE_USE_FIREBASE_AI', 'VITE_GEMINI_MODEL',
  ]) {
    vi.stubEnv(k, '')
  }
  vi.clearAllMocks()
  genai.ctorArgs.length = 0
  fbase.getApps.mockReturnValue([])
  fbase.initializeApp.mockReturnValue({ name: 'app' })
  fbase.getAI.mockReturnValue({ name: 'ai' })
  fbase.generateContent.mockResolvedValue({ response: { text: () => '{"ok":true}' } })
  fbase.getGenerativeModel.mockReturnValue({ generateContent: fbase.generateContent })
})

afterEach(() => vi.unstubAllEnvs())

describe('createAiProvider — selection', () => {
  it('returns null when nothing is configured', () => {
    expect(createAiProvider()).toBeNull()
  })

  it('uses Firebase AI Logic when the Firebase web config is present', () => {
    for (const [k, v] of Object.entries(FIREBASE_ENV)) vi.stubEnv(k, v)
    expect(createAiProvider()?.name).toBe('firebase-ai-logic')
  })

  it('needs all three of API key, project id and app id for Firebase', () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'k')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'p')
    expect(createAiProvider()).toBeNull()
  })

  it('prefers Firebase over a direct key when both exist', () => {
    for (const [k, v] of Object.entries(FIREBASE_ENV)) vi.stubEnv(k, v)
    vi.stubEnv('VITE_GEMINI_API_KEY', 'gem-key')
    expect(createAiProvider()?.name).toBe('firebase-ai-logic')
  })

  it('can be forced off Firebase with VITE_USE_FIREBASE_AI=false', () => {
    for (const [k, v] of Object.entries(FIREBASE_ENV)) vi.stubEnv(k, v)
    vi.stubEnv('VITE_USE_FIREBASE_AI', 'false')
    expect(createAiProvider()).toBeNull()
    vi.stubEnv('VITE_GEMINI_API_KEY', 'gem-key')
    expect(createAiProvider()?.name).toBe('gemini-api-key')
  })

  it('honours a direct key in dev', () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'gem-key')
    expect(createAiProvider()?.name).toBe('gemini-api-key')
  })

  it('ignores a direct key in a production build unless explicitly allowed', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_GEMINI_API_KEY', 'gem-key')
    expect(createAiProvider()).toBeNull()
    vi.stubEnv('VITE_ALLOW_CLIENT_KEY', 'true')
    expect(createAiProvider()?.name).toBe('gemini-api-key')
  })

  it('does not treat any other value of the opt-in flag as consent', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_GEMINI_API_KEY', 'gem-key')
    for (const v of ['1', 'yes', 'TRUE', 'True']) {
      vi.stubEnv('VITE_ALLOW_CLIENT_KEY', v)
      expect(createAiProvider(), v).toBeNull()
    }
  })
})

describe('direct API-key provider', () => {
  beforeEach(() => vi.stubEnv('VITE_GEMINI_API_KEY', 'gem-key'))

  it('sends the prompt, system instruction and JSON mode, and returns the text', async () => {
    genai.generateContent.mockResolvedValue({ text: '{"a":1}' })
    const out = await createAiProvider()!.generate(request)
    expect(out).toBe('{"a":1}')
    expect(genai.ctorArgs[0]).toEqual({ apiKey: 'gem-key' })
    const args = genai.generateContent.mock.calls[0][0]
    expect(args.model).toBe(DEFAULT_MODELS[0])
    expect(args.contents).toBe('PROMPT')
    expect(args.config).toMatchObject({ systemInstruction: 'SYS', responseMimeType: 'application/json', temperature: 0.2 })
  })

  it('attaches a file as inline data and does not force JSON for transcription', async () => {
    genai.generateContent.mockResolvedValue({ text: 'transcribed' })
    await createAiProvider()!.generate({ ...request, json: false, file: { mimeType: 'image/png', base64: 'AAAA' } })
    const args = genai.generateContent.mock.calls[0][0]
    expect(args.contents).toEqual([{ role: 'user', parts: [{ text: 'PROMPT' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }] }])
    expect(args.config.responseMimeType).toBeUndefined()
    expect(args.config.temperature).toBe(0)
  })

  it('throws on an empty response so the pipeline can retry or fall back', async () => {
    genai.generateContent.mockResolvedValue({ text: '' })
    await expect(createAiProvider()!.generate(request)).rejects.toThrow(/Empty response/)
  })

  it('propagates SDK errors', async () => {
    genai.generateContent.mockRejectedValue(new Error('429 quota'))
    await expect(createAiProvider()!.generate(request)).rejects.toThrow(/429/)
  })
})

describe('Firebase AI Logic provider', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(FIREBASE_ENV)) vi.stubEnv(k, v)
  })

  it('initialises the app once with derived defaults and uses the Gemini Developer API backend', async () => {
    const out = await createAiProvider()!.generate(request)
    expect(out).toBe('{"ok":true}')
    expect(fbase.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'fb-key', projectId: 'proj', appId: '1:2:web:3', authDomain: 'proj.firebaseapp.com' }),
    )
    expect(fbase.getAI).toHaveBeenCalledTimes(1)
    expect(fbase.getAI.mock.calls[0][1].backend.constructor.name).toBe('GoogleAIBackend')
  })

  it('reuses an existing Firebase app instead of initialising twice', async () => {
    fbase.getApps.mockReturnValue([{ name: '[DEFAULT]' }])
    fbase.getApp.mockReturnValue({ name: 'existing' })
    await createAiProvider()!.generate(request)
    expect(fbase.initializeApp).not.toHaveBeenCalled()
    expect(fbase.getAI.mock.calls[0][0]).toEqual({ name: 'existing' })
  })

  it('configures model, system instruction and JSON mode', async () => {
    await createAiProvider()!.generate(request)
    expect(fbase.getGenerativeModel).toHaveBeenCalledWith(
      { name: 'ai' },
      { model: DEFAULT_MODELS[0], systemInstruction: 'SYS', generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } },
    )
    expect(fbase.generateContent).toHaveBeenCalledWith(['PROMPT'])
  })

  it('sends attachments as inlineData parts, in text mode', async () => {
    await createAiProvider()!.generate({ ...request, json: false, file: { mimeType: 'application/pdf', base64: 'JVBER' } })
    expect(fbase.getGenerativeModel.mock.calls[0][1].generationConfig).toEqual({ temperature: 0 })
    expect(fbase.generateContent).toHaveBeenCalledWith(['PROMPT', { inlineData: { mimeType: 'application/pdf', data: 'JVBER' } }])
  })

  it('propagates blocked/failed responses instead of swallowing them', async () => {
    fbase.generateContent.mockResolvedValue({ response: { text: () => { throw new Error('Response was blocked') } } })
    await expect(createAiProvider()!.generate(request)).rejects.toThrow(/blocked/)
  })
})
