import type { IsoDate, ResolvedDeadline, Urgency } from '../types'
import { daysLeft } from './deadlines'

/** Thresholds in days. Chosen so "critical" means "act today or tomorrow". */
export const CRITICAL_DAYS = 3
export const HIGH_DAYS = 7
export const MODERATE_DAYS = 15

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Urgency is derived from dates by code, never asked of the model: the same notice and the same
 * receipt date always give the same answer.
 */
export function deriveUrgency(deadlines: readonly ResolvedDeadline[], today: IsoDate): Urgency {
  const dated = deadlines
    .map((d) => ({ d, left: daysLeft(d, today) }))
    .filter((x): x is { d: ResolvedDeadline; left: number } => x.left !== null)

  const upcoming = dated.filter((x) => x.left >= 0).sort((a, b) => a.left - b.left)
  const past = dated.filter((x) => x.left < 0)

  if (upcoming.length > 0) {
    const next = upcoming[0]
    const when = next.left === 0 ? 'today' : `in ${plural(next.left, 'day')}`
    const passed = past.length > 0 ? ` ${plural(past.length, 'earlier date')} already passed.` : ''
    const level =
      next.left <= CRITICAL_DAYS
        ? 'critical'
        : next.left <= HIGH_DAYS
          ? 'high'
          : next.left <= MODERATE_DAYS
            ? 'moderate'
            : 'low'
    return { level, reason: `Next date: ${next.d.label} — ${when}.${passed}` }
  }

  if (past.length > 0) {
    const latest = [...past].sort((a, b) => b.left - a.left)[0]
    return {
      level: 'overdue',
      reason: `The latest date, "${latest.d.label}", passed ${plural(Math.abs(latest.left), 'day')} ago. Speak to a lawyer promptly.`,
    }
  }

  return {
    level: 'unknown',
    reason: 'No deadline could be worked out from this notice. Ask a lawyer whether a legal time limit applies.',
  }
}
