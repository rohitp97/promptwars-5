import type { AiProvider, AnalysisResult, IntakeOptions, UploadedFile } from '../types'
import { parseJsonLoose } from './ai'
import { assembleResult, isUnusable } from './analysis'
import { buildFallbackResponse } from './fallback'
import { buildAnalysisPrompt, buildTranscriptionPrompt, MAX_SOURCE_CHARS } from './prompts'
import { detectNoticeType } from './retrieval'
import { parseAnalysis } from './validation'
import { todayIso } from './dates'
import { withTimeout } from './withTimeout'

/** Above 4 models x the per-model timeout, so failover isn't cut short by this outer limit. */
export const ANALYSIS_TIMEOUT_MS = 170_000
export const TRANSCRIBE_TIMEOUT_MS = 100_000
export const MIN_NOTICE_CHARS = 20
const MAX_ATTEMPTS = 2

/** An error whose message is safe and useful to show to the person as-is. */
export class UserError extends Error {}

export interface PipelineDeps {
  provider: AiProvider | null
  now?: () => Date
}

type FailureKind = 'timeout' | 'format' | 'quota' | 'config' | 'busy' | 'unavailable'

/**
 * Only a malformed answer is worth a second attempt. Outages, overload, quota and setup problems
 * are not: the AI layer has already failed over across models, so retrying here would only make
 * the person wait longer for the same result.
 */
const RETRYABLE: readonly FailureKind[] = ['format']

export function classify(err: unknown): FailureKind {
  const message = err instanceof Error ? err.message : String(err)
  if (/timed out|timeout/i.test(message)) return 'timeout'
  // Config before format: "API key not valid" is a setup problem, not a malformed answer.
  if (/\b(401|403)\b|permission.?denied|unauthenticated|forbidden|has not been used|is disabled|api key not valid|not[ -]enabled|to be enabled|AI\/(no-api-key|no-project-id|no-app-id|api-not-enabled)/i.test(message)) return 'config'
  if (err instanceof SyntaxError || /expected shape|not valid/i.test(message)) return 'format'
  if (/429|quota|rate.?limit|resource.?exhausted/i.test(message)) return 'quota'
  if (/high demand|overloaded|\b(500|502|503|504)\b|unavailable/i.test(message)) return 'busy'
  return 'unavailable'
}

const FAILURE_TEXT: Record<FailureKind, string> = {
  timeout: 'The AI service took too long to answer.',
  format: 'The AI answered in a format the app could not use.',
  quota: 'The AI service has reached its usage limit for now.',
  config: 'The AI service refused the request; it may not be enabled for this site yet.',
  busy: 'The AI service is very busy right now.',
  unavailable: 'The AI service could not be reached.',
}

/** Non-empty, within limits; throws a UserError describing exactly what to fix. */
export function validateNoticeText(raw: string): string {
  const text = raw.trim()
  if (text.length === 0) throw new UserError('Paste the notice text or upload a photo first.')
  if (text.length < MIN_NOTICE_CHARS) throw new UserError('That is too short to be a notice. Paste the full text.')
  if (text.length > MAX_SOURCE_CHARS) {
    throw new UserError(`That is longer than ${MAX_SOURCE_CHARS.toLocaleString('en-IN')} characters. Paste the notice itself (usually 1–3 pages), not the whole file.`)
  }
  return text
}

function fallbackResult(text: string, options: IntakeOptions, now: Date, reason: string): AnalysisResult {
  return assembleResult({
    response: buildFallbackResponse(text),
    malformed: 0,
    sourceText: text,
    receivedOn: options.receivedOn,
    today: todayIso(now),
    source: 'fallback',
    fallbackReason: reason,
  })
}

/**
 * The whole analysis: ask the model (with one retry), parse strictly, verify every claim, resolve
 * dates in code. Anything that goes wrong lands on the rule-based reading, clearly labelled.
 */
export async function analyseNotice(rawText: string, options: IntakeOptions, deps: PipelineDeps): Promise<AnalysisResult> {
  const text = validateNoticeText(rawText)
  const now = (deps.now ?? (() => new Date()))()

  if (!deps.provider) {
    return fallbackResult(text, options, now, 'No AI is configured for this deployment.')
  }

  const hint = detectNoticeType(text)
  const { systemInstruction, prompt } = buildAnalysisPrompt({ sourceText: text, receivedOn: options.receivedOn, language: options.language, hint })

  let failure: FailureKind = 'unavailable'
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await withTimeout(
        deps.provider.generate({ systemInstruction, prompt, json: true }),
        ANALYSIS_TIMEOUT_MS,
        'The AI request timed out',
      )
      const parsed = parseAnalysis(parseJsonLoose(raw))
      if (!parsed) throw new Error('The AI response did not match the expected shape')

      const result = assembleResult({
        response: parsed.response,
        malformed: parsed.malformed,
        sourceText: text,
        receivedOn: options.receivedOn,
        today: todayIso(now),
        source: 'gemini',
        fallbackReason: null,
      })
      if (isUnusable(result)) {
        return fallbackResult(text, options, now, 'None of the AI’s statements could be verified against your notice, so nothing from it is shown.')
      }
      return result
    } catch (err) {
      failure = classify(err)
      // For whoever operates the site: the person sees a friendly note, the console keeps the cause.
      console.warn(`[cited] AI request failed (${failure}, attempt ${attempt}):`, err instanceof Error ? err.message : err)
      if (!RETRYABLE.includes(failure)) break
    }
  }
  return fallbackResult(text, options, now, `${FAILURE_TEXT[failure]} Showing a simpler rule-based reading instead.`)
}

/** Photo / PDF → text the person can check before analysis. Throws a UserError on failure. */
export async function transcribeFile(file: UploadedFile, deps: PipelineDeps): Promise<string> {
  if (!deps.provider) {
    throw new UserError('Reading photos and PDFs needs the AI, which is not configured here. Paste the text instead.')
  }
  const { systemInstruction, prompt } = buildTranscriptionPrompt()
  let text: string
  try {
    text = await withTimeout(
      deps.provider.generate({ systemInstruction, prompt, json: false, file: { mimeType: file.mimeType, base64: file.base64 } }),
      TRANSCRIBE_TIMEOUT_MS,
      'The AI request timed out',
    )
  } catch (err) {
    throw new UserError(`${FAILURE_TEXT[classify(err)]} Try again, or paste the text instead.`)
  }
  const cleaned = text.trim()
  if (cleaned.replace(/\[illegible\]/gi, '').trim().length < MIN_NOTICE_CHARS) {
    throw new UserError('Almost nothing could be read from that file. Try a clearer, straighter photo, or paste the text.')
  }
  return cleaned.slice(0, MAX_SOURCE_CHARS)
}
