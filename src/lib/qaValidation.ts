import type { RawAnswer, RawFinding } from '../types'
import { LIMITS, isRecord, optionalText, parseFinding } from './validation'

export interface ParsedAnswer {
  response: RawAnswer
  /** Statements dropped because they were malformed (wrong types, over-long, missing text). */
  malformed: number
}

/**
 * Strictly parses the model's reply to a question. Same philosophy as `parseAnalysis`: structural
 * breakage rejects the whole reply (so the caller can retry), while individual bad statements are
 * dropped and counted so the person can be told.
 */
export function parseQaResponse(raw: unknown): ParsedAnswer | null {
  if (!isRecord(raw)) return null
  // An absent "answer" is not the same as an empty one: a missing key means the model ignored the format.
  if (!Array.isArray(raw.answer)) return null

  const notInNotice = optionalText(raw.notInNotice, LIMITS.notInNotice)
  const lawyerQuestion = optionalText(raw.lawyerQuestion, LIMITS.question)
  if (notInNotice === undefined || lawyerQuestion === undefined) return null

  const offTopic = raw.offTopic ?? false
  if (typeof offTopic !== 'boolean') return null

  const answer: RawFinding[] = []
  let malformed = Math.max(0, raw.answer.length - LIMITS.answerStatements)
  for (const item of raw.answer.slice(0, LIMITS.answerStatements)) {
    const parsed = parseFinding(item)
    if (parsed === null) malformed++
    else answer.push(parsed)
  }

  return { response: { answer, notInNotice, lawyerQuestion, offTopic }, malformed }
}
