import type { AiProvider, AiRequest } from '../types'
import { anyOf } from './regex'
import { withTimeout } from './withTimeout'

/**
 * Models are tried in this order. Google retires models for new projects without notice (a model
 * that worked yesterday can 404 today: "no longer available to new users") and the newest ones are
 * often overloaded, so a single hard-coded model is a single point of failure.
 *
 * Order chosen from a live benchmark through a fresh Firebase project (real prompt, real verifier,
 * English/Hindi/no-playbook/eviction/injection notices): the flash-lite models answered in 5-7 s
 * with correct, fully verified results, while gemini-3.6-flash / 3.5-flash took 25-80 s or returned
 * "high demand" 500s. Lite is thinner (fewer "not in your notice" gaps) but reliably fast; the
 * fuller models remain as backups. Override with VITE_GEMINI_MODEL (comma-separated list).
 */
export const DEFAULT_MODELS: readonly string[] = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
]

/** A model that hasn't answered in this long is treated as failed so the next one gets its turn. */
export const PER_MODEL_TIMEOUT_MS = 40_000

const TEMPERATURE = 0.2

/** Read lazily (not at import time) so configuration changes and tests take effect. */
export function readModels(): string[] {
  const list = String(import.meta.env.VITE_GEMINI_MODEL ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
  return list.length > 0 ? list : [...DEFAULT_MODELS]
}

/**
 * Errors where a DIFFERENT model may well succeed: the model is gone (404), overloaded (500/503,
 * "high demand"), rate-limited on its own quota (429), or simply slow. Setup errors (403, bad key,
 * API not enabled) are deliberately absent: no other model can fix those, so they surface at once.
 */
const SWITCH_MODEL_RE = anyOf(
  /\b(404|429|500|502|503|504)\b/,
  /not[ _]found/,
  /no longer available/,
  /is not supported/,
  /high demand/,
  /overloaded/,
  /unavailable/,
  /resource.?exhausted/,
  /quota/,
  /timed out/,
)

/**
 * The model that most recently answered in this page session. An overloaded model can take ~20 s
 * just to say so, so once one has worked, later requests start there instead of re-paying that
 * cost on every notice. In-memory only: a fresh visit starts from the configured order again.
 */
let lastWorkingModel: string | null = null

export function resetModelPreference(): void {
  lastWorkingModel = null
}

export function orderModels(models: readonly string[]): string[] {
  if (lastWorkingModel !== null && models.includes(lastWorkingModel)) {
    return [lastWorkingModel, ...models.filter((m) => m !== lastWorkingModel)]
  }
  return [...models]
}

export async function withModelFailover<T>(
  configured: readonly string[],
  attempt: (model: string) => Promise<T>,
  timeoutMs: number = PER_MODEL_TIMEOUT_MS,
): Promise<T> {
  const models = orderModels(configured)
  let last: unknown
  for (let i = 0; i < models.length; i++) {
    const model = models[i]
    try {
      const result = await withTimeout(attempt(model), timeoutMs, 'The AI request timed out')
      lastWorkingModel = model
      return result
    } catch (err) {
      last = err
      const message = err instanceof Error ? err.message : String(err)
      const hasNext = i < models.length - 1
      if (!hasNext || !SWITCH_MODEL_RE.test(message)) throw err
      // For whoever operates the site; never includes the notice.
      console.warn(`[cited] model ${model} failed, trying ${models[i + 1]}: ${message.slice(0, 200)}`)
    }
  }
  throw last
}

interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

function readFirebaseConfig(): FirebaseConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
  const appId = import.meta.env.VITE_FIREBASE_APP_ID
  if (!apiKey || !projectId || !appId) return null
  return {
    apiKey,
    projectId,
    appId,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  }
}

/**
 * Preferred: Firebase AI Logic. Gemini is called through the Firebase project, so no Gemini API
 * key is shipped in the client bundle. The SDK is imported lazily so it costs nothing unless used.
 */
function firebaseProvider(config: FirebaseConfig): AiProvider {
  return {
    name: 'firebase-ai-logic',
    async generate(req: AiRequest): Promise<string> {
      const [{ getApp, getApps, initializeApp }, { getAI, getGenerativeModel, GoogleAIBackend }] = await Promise.all([
        import('firebase/app'),
        import('firebase/ai'),
      ])
      const app = getApps().length > 0 ? getApp() : initializeApp(config)
      const ai = getAI(app, { backend: new GoogleAIBackend() })
      const parts: Array<string | { inlineData: { mimeType: string; data: string } }> = [req.prompt]
      if (req.file) parts.push({ inlineData: { mimeType: req.file.mimeType, data: req.file.base64 } })

      return withModelFailover(readModels(), async (modelName) => {
        const model = getGenerativeModel(ai, {
          model: modelName,
          systemInstruction: req.systemInstruction,
          generationConfig: req.json
            ? { responseMimeType: 'application/json', temperature: TEMPERATURE }
            : { temperature: 0 },
        })
        const result = await model.generateContent(parts)
        return result.response.text()
      })
    },
  }
}

/** Local-development fallback: direct Gemini API key (the key ends up in the client bundle). */
function apiKeyProvider(apiKey: string): AiProvider {
  return {
    name: 'gemini-api-key',
    async generate(req: AiRequest): Promise<string> {
      const { GoogleGenAI } = await import('@google/genai')
      const ai = new GoogleGenAI({ apiKey })
      const contents = req.file
        ? [
            {
              role: 'user',
              parts: [{ text: req.prompt }, { inlineData: { mimeType: req.file.mimeType, data: req.file.base64 } }],
            },
          ]
        : req.prompt

      return withModelFailover(readModels(), async (modelName) => {
        const result = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction: req.systemInstruction,
            temperature: req.json ? TEMPERATURE : 0,
            ...(req.json ? { responseMimeType: 'application/json' } : {}),
          },
        })
        if (!result.text) throw new Error('Empty response from Gemini')
        return result.text
      })
    },
  }
}

/**
 * Provider order: Firebase AI Logic (if the Firebase web config is present and not switched off)
 * → direct API key → null. Null means "no AI configured": callers must use the rule-based fallback.
 *
 * Secure by default: a client-side Gemini key is only honoured in `vite dev`, or in a build made with
 * VITE_ALLOW_CLIENT_KEY=true. Otherwise the key branch is dead code, so a stray VITE_GEMINI_API_KEY
 * in a production .env can never end up in the shipped bundle.
 */
export function createAiProvider(): AiProvider | null {
  const firebase = readFirebaseConfig()
  if (firebase && import.meta.env.VITE_USE_FIREBASE_AI !== 'false') return firebaseProvider(firebase)
  const allowClientKey = import.meta.env.DEV || import.meta.env.VITE_ALLOW_CLIENT_KEY === 'true'
  const key: string | undefined = allowClientKey ? import.meta.env.VITE_GEMINI_API_KEY : undefined
  if (key) return apiKeyProvider(key)
  return null
}

/** Strip a ```json fence if the model added one despite JSON mode, then parse. */
export function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  return JSON.parse(fenced ? fenced[1] : trimmed)
}
