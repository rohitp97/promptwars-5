import { buildRefIndex, getPlaybookEntry } from '../data/playbook'
import type {
  AnalysisResult,
  AnalysisSource,
  AnswerStatus,
  NoticeType,
  RawAnswer,
  RemovedFinding,
  VerifiedAnswer,
  VerifiedFinding,
} from '../types'
import { clip } from './fallback'
import { splitSentences } from './extract'
import { FAILURE_TEXT, UserError, requestJson } from './pipeline'
import type { PipelineDeps } from './pipeline'
import { MAX_QUESTION_CHARS, buildQaPrompt } from './prompts'
import { parseQaResponse } from './qaValidation'
import { prepareSource, verifyFinding } from './verify'

export const MIN_QUESTION_CHARS = 3
/** Answers kept per session; older ones drop off so memory stays bounded. */
export const MAX_ANSWERS = 20

const DEFAULT_NOT_IN_NOTICE = 'Your notice does not say anything about this.'

/** What a question needs from the analysed notice; a subset of AnalysisResult so callers can't over-share. */
export type QaContext = Pick<AnalysisResult, 'sourceText' | 'noticeType' | 'receivedOn'>

/** Trims, collapses whitespace and enforces the length limits; throws a UserError saying what to fix. */
export function validateQuestion(raw: string): string {
  const question = raw.replace(/\s+/g, ' ').trim()
  if (question.length === 0) throw new UserError('Type a question first.')
  if (question.length < MIN_QUESTION_CHARS) throw new UserError('That is too short to be a question.')
  if (question.length > MAX_QUESTION_CHARS) {
    throw new UserError(`Please keep your question under ${MAX_QUESTION_CHARS} characters.`)
  }
  return question
}

export interface AssembleAnswerInput {
  id: string
  question: string
  response: RawAnswer
  /** Statements the parser dropped as malformed. */
  malformed: number
  sourceText: string
  noticeType: NoticeType
  source: AnalysisSource
  fallbackReason: string | null
}

/**
 * Verify every statement with the same rules as the main analysis (a quote must be in the notice, or
 * a playbook reference must be real), then work out the status from what survived. Pure: the same
 * inputs always give the same answer.
 */
export function assembleAnswer(input: AssembleAnswerInput): VerifiedAnswer {
  const { id, response } = input
  const refs = buildRefIndex(getPlaybookEntry(input.noticeType))
  const src = prepareSource(input.sourceText)

  const verified: VerifiedFinding[] = []
  const removed: RemovedFinding[] = []
  response.answer.forEach((raw, index) => {
    const check = verifyFinding('answer', raw, src, refs)
    if (check.ok) {
      verified.push({
        id: `${id}-${index}`,
        section: 'answer',
        text: raw.text,
        why: raw.why,
        provenance: check.provenance,
      })
    } else {
      removed.push({ section: 'answer', text: raw.text, reason: check.reason })
    }
  })
  if (input.malformed > 0) {
    removed.push({
      section: 'malformed',
      text: `${input.malformed} statement${input.malformed === 1 ? '' : 's'} in the AI response`,
      reason: 'Did not match the expected format and was skipped',
    })
  }

  // A question that isn't about this notice gets no answer at all, even if the model added statements.
  const statements = response.offTopic ? [] : verified
  const status = deriveStatus(statements, removed, response)

  return {
    id,
    question: input.question,
    status,
    statements,
    notInNotice: status === 'not_in_notice' ? (response.notInNotice ?? DEFAULT_NOT_IN_NOTICE) : response.notInNotice,
    lawyerQuestion: status === 'off_topic' ? null : response.lawyerQuestion,
    removed,
    source: input.source,
    fallbackReason: input.fallbackReason,
  }
}

function deriveStatus(
  statements: readonly VerifiedFinding[],
  removed: readonly RemovedFinding[],
  response: RawAnswer,
): AnswerStatus {
  if (response.offTopic) return 'off_topic'
  if (statements.length > 0) return response.notInNotice ? 'partly' : 'answered'
  // The AI said things, but none survived verification: better to say so than to imply the notice is silent.
  if (removed.some((r) => r.section === 'answer')) return 'unverified'
  return 'not_in_notice'
}

// ── Rule-based fallback ───────────────────────────────────────────────────────

const STOPWORDS = new Set(
  (
    'a an the and or but if then than that this these those what which who whom whose when where why how ' +
    'is are was were be been being am do does did done doing have has had having can could shall should ' +
    'will would may might must not no nor so too very just about above after again all any because before ' +
    'below between both each few for from further here into its more most other our out over own same ' +
    'some such only there they them their through under until upon while with within without you your ' +
    'yours i me my mine we us he him his she her it notice tell say says said'
  ).split(' '),
)

/** Distinct, lower-cased content words of a question (stop-words and 1-2 letter Latin words removed). */
export function questionTokens(question: string): string[] {
  const tokens = new Set<string>()
  for (const word of question.toLowerCase().split(/[^\p{L}\p{N}\p{M}]+/u)) {
    const isLatin = /^[a-z0-9]+$/.test(word)
    if (word.length >= (isLatin ? 3 : 2) && !STOPWORDS.has(word)) tokens.add(word)
  }
  return [...tokens]
}

const MAX_FALLBACK_PASSAGES = 2
const MIN_WORD_LENGTH = 3

/** A question word matches a sentence word if either contains the other ("payment" ~ "pay"). */
function wordMatches(token: string, word: string): boolean {
  if (word.length < MIN_WORD_LENGTH && token.length >= MIN_WORD_LENGTH) return false
  return word.includes(token) || token.includes(word)
}

function scoreSentence(sentence: string, tokens: readonly string[]): number {
  const words = sentence
    .toLowerCase()
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter(Boolean)
  return tokens.filter((token) => words.some((word) => wordMatches(token, word))).length
}

/**
 * With no AI, the best honest thing is to point at the passages that mention the question's words.
 * Each passage is a slice of the notice, so it passes the same verifier as everything else; nothing
 * is interpreted.
 */
export function buildFallbackAnswer(sourceText: string, question: string): RawAnswer {
  const tokens = questionTokens(question)
  const ranked = splitSentences(sourceText)
    .map((sentence, position) => ({ sentence, position, score: scoreSentence(sentence, tokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.position - b.position)
    .slice(0, MAX_FALLBACK_PASSAGES)

  if (ranked.length === 0) {
    return {
      answer: [],
      notInNotice:
        'No passage in your notice seems to use those words. That may just be different wording, so read the notice or ask a lawyer.',
      lawyerQuestion: null,
      offTopic: false,
    }
  }
  return {
    answer: ranked.map((s) => ({
      text: 'This part of your notice looks related:',
      why: null,
      quote: clip(s.sentence),
      playbookRef: null,
    })),
    notInNotice: null,
    lawyerQuestion: null,
    offTopic: false,
  }
}

// ── Orchestration ─────────────────────────────────────────────────────────────

let answerCounter = 0

function fallbackAnswer(
  base: Omit<AssembleAnswerInput, 'response' | 'malformed' | 'source' | 'fallbackReason'>,
  reason: string,
) {
  return assembleAnswer({
    ...base,
    response: buildFallbackAnswer(base.sourceText, base.question),
    malformed: 0,
    source: 'fallback',
    fallbackReason: reason,
  })
}

/**
 * Answer one question about an analysed notice. Anything that goes wrong (no AI, an outage, an
 * unusable reply, nothing verifiable) lands on the keyword fallback, clearly labelled.
 */
export async function askQuestion(
  rawQuestion: string,
  context: QaContext,
  deps: PipelineDeps,
): Promise<VerifiedAnswer> {
  const question = validateQuestion(rawQuestion)
  const base = { id: `qa${++answerCounter}`, question, sourceText: context.sourceText, noticeType: context.noticeType }

  if (!deps.provider) return fallbackAnswer(base, 'No AI is configured for this deployment.')

  const { systemInstruction, prompt } = buildQaPrompt({ ...base, receivedOn: context.receivedOn })
  const outcome = await requestJson(deps.provider, { systemInstruction, prompt }, parseQaResponse)
  if (!outcome.ok) {
    return fallbackAnswer(base, `${FAILURE_TEXT[outcome.failure]} Showing passages that mention your words instead.`)
  }

  const answer = assembleAnswer({
    ...base,
    response: outcome.value.response,
    malformed: outcome.value.malformed,
    source: 'gemini',
    fallbackReason: null,
  })
  if (answer.status === 'unverified') {
    return fallbackAnswer(base, 'None of the AI’s statements could be verified against your notice.')
  }
  return answer
}
