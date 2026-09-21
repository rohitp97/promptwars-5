import type { IsoDate, RawDeadline, RemovedFinding, ResolvedDeadline } from '../types'
import type { PlaybookEntry } from '../data/playbook'
import { addDays, addMonths, diffDays, formatShort, isValidIso } from './dates'
import { extractDates, parseDaysPhrase } from './extract'
import { verifyQuote } from './verify'
import type { PreparedSource } from './verify'

export interface DeadlineContext {
  /** The day the user actually received the notice (drives "within N days of receipt"). */
  receivedOn: IsoDate
  /** The date printed on the notice, if the notice states one. */
  noticeDate: IsoDate | null
  today: IsoDate
}

export const MAX_RELATIVE_DAYS = 3650

export interface DateResolution {
  date: IsoDate | null
  basis: string
}

/**
 * Turn a deadline as *stated* in the notice into a real date. The model only reads the wording
 * ("within 15 days of receipt"); the arithmetic happens here, in tested code.
 */
export function resolveRawDeadline(deadline: RawDeadline, ctx: DeadlineContext): DateResolution {
  if (deadline.kind === 'absolute') {
    if (deadline.date !== null && isValidIso(deadline.date)) {
      return { date: deadline.date, basis: `Stated in the notice as ${formatShort(deadline.date)}` }
    }
    return { date: null, basis: 'The notice gives a date, but it could not be read reliably. Check the quote below.' }
  }

  const days = deadline.days
  if (days === null || !Number.isInteger(days) || days < 0 || days > MAX_RELATIVE_DAYS) {
    return { date: null, basis: 'The number of days could not be read reliably. Check the quote below.' }
  }

  switch (deadline.from) {
    case 'receipt':
      return {
        date: addDays(ctx.receivedOn, days),
        basis: `${days} days from receipt (you received it on ${formatShort(ctx.receivedOn)})`,
      }
    case 'notice_date':
      if (ctx.noticeDate === null) {
        return { date: null, basis: `${days} days from the date on the notice, but the notice does not state its date.` }
      }
      return {
        date: addDays(ctx.noticeDate, days),
        basis: `${days} days from the date of the notice (${formatShort(ctx.noticeDate)})`,
      }
    default:
      return { date: null, basis: `${days} days from an event the notice does not pin to a date.` }
  }
}

export interface NoticeDeadlines {
  deadlines: ResolvedDeadline[]
  removed: RemovedFinding[]
}

export type CrossCheck = 'match' | 'mismatch' | 'unchecked'

/**
 * The model reads a date / day-count out of a quote. Re-read the same quote with rules and compare:
 * a disagreement means we can't trust the number, so no date is shown (better blank than wrong).
 * 'unchecked' = the quote's wording isn't one the rules recognise (e.g. "fifteenth day of October").
 */
export function crossCheckDeadline(d: RawDeadline, quoteText: string): CrossCheck {
  if (d.kind === 'absolute') {
    const dates = extractDates(quoteText)
    if (dates.length === 0) return 'unchecked'
    return d.date !== null && dates.includes(d.date) ? 'match' : 'mismatch'
  }
  const phrase = parseDaysPhrase(quoteText)
  if (phrase === null) return 'unchecked'
  return phrase.days === d.days ? 'match' : 'mismatch'
}

/** Stated deadlines must carry a quote that verifies; otherwise they are removed like any other claim. */
export function resolveNoticeDeadlines(
  raw: readonly RawDeadline[],
  src: PreparedSource,
  ctx: DeadlineContext,
): NoticeDeadlines {
  const deadlines: ResolvedDeadline[] = []
  const removed: RemovedFinding[] = []

  raw.forEach((d, index) => {
    const match = verifyQuote(d.quote, src)
    if (match.status === 'unverified') {
      removed.push({ section: 'deadlines', text: d.label, reason: 'Quote not found in the notice' })
      return
    }
    const quoteText = src.original.slice(match.start, match.end)
    const check = crossCheckDeadline(d, quoteText)

    let { date, basis } = resolveRawDeadline(d, ctx)
    if (check === 'mismatch') {
      date = null
      basis = 'The date or number the AI read does not match the quote, so no date is shown. Read the quote yourself.'
    } else if (check === 'unchecked' && date !== null) {
      basis = `${basis}. Read by AI from wording the app cannot double-check, so confirm it against the quote.`
    }

    deadlines.push({
      id: `notice-deadline-${index}`,
      label: d.label,
      origin: 'notice',
      date,
      basis,
      provenance: { kind: 'document', status: match.status, quote: quoteText, start: match.start, end: match.end },
    })
  })
  return { deadlines, removed }
}

/**
 * Typical statutory time limits for the detected notice type, computed from the receipt date.
 * Labelled PLAYBOOK in the UI: they are general information, not something the notice says.
 */
export function resolveStatutoryDeadlines(entry: PlaybookEntry | null, ctx: DeadlineContext): ResolvedDeadline[] {
  if (!entry) return []
  const out: ResolvedDeadline[] = []
  let previous: IsoDate | null = null

  for (const tl of entry.timelines) {
    let date: IsoDate | null = null
    let basis: string

    if (tl.anchor === 'event') {
      basis = `${tl.note} (${tl.statuteRef})`
    } else {
      const base: IsoDate | null = tl.anchor === 'receipt' ? ctx.receivedOn : previous
      if (base === null) {
        basis = `Depends on the previous date, which could not be computed. (${tl.statuteRef})`
      } else {
        date = addDays(addMonths(base, tl.offset?.months ?? 0), tl.offset?.days ?? 0)
        const from = tl.anchor === 'receipt' ? `receipt (${formatShort(ctx.receivedOn)})` : 'the previous date'
        basis = `Counted from ${from}. ${tl.note} (${tl.statuteRef})`
      }
    }
    previous = date
    out.push({
      id: tl.id,
      label: tl.label,
      origin: 'statute',
      date,
      basis,
      statuteRef: tl.statuteRef,
      provenance: { kind: 'playbook', ref: tl.id, refLabel: `${entry.title} playbook · ${tl.statuteRef}` },
    })
  }
  return out
}

/** Whole days until the deadline (negative once it has passed); null when the date is unknown. */
export function daysLeft(deadline: Pick<ResolvedDeadline, 'date'>, today: IsoDate): number | null {
  return deadline.date === null ? null : diffDays(today, deadline.date)
}

/** Dated deadlines first (earliest first), undated ones after. */
export function sortDeadlines(list: readonly ResolvedDeadline[]): ResolvedDeadline[] {
  return [...list].sort((a, b) => {
    if (a.date === null && b.date === null) return 0
    if (a.date === null) return 1
    if (b.date === null) return -1
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  })
}
