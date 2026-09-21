import { PLAYBOOK } from '../data/playbook'
import type { NoticeType } from '../types'

export interface Detection {
  type: NoticeType
  scores: Record<string, number>
  /** Signal terms that matched for the winning type (shown in fallback mode). */
  matched: string[]
}

/** A single weak keyword (e.g. just "bond") is not enough to claim a notice type. */
export const MIN_SCORE = 3

/**
 * Local, deterministic notice-type detector. It is a *hint* for the model and the whole basis for
 * the offline fallback — the app never trusts it over a verified model answer.
 */
export function detectNoticeType(text: string): Detection {
  const haystack = text.toLowerCase()
  const scores: Record<string, number> = {}
  let best: { id: string; score: number; matched: string[] } | null = null

  for (const entry of PLAYBOOK) {
    let score = 0
    const matched: string[] = []
    for (const { term, weight } of entry.signals) {
      if (haystack.includes(term.toLowerCase())) {
        score += weight
        matched.push(term)
      }
    }
    scores[entry.id] = score
    if (score > 0 && (best === null || score > best.score)) best = { id: entry.id, score, matched }
  }

  if (best === null || best.score < MIN_SCORE) return { type: 'other', scores, matched: [] }
  return { type: best.id as NoticeType, scores, matched: best.matched }
}
