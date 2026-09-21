import type { IsoDate } from '../types'
import { buildIso, monthNumber } from './dates'

/**
 * Rule-based extraction shared by (a) the offline fallback and (b) the cross-check that compares
 * a model-read date / day-count against the quote it claims to come from.
 */

const WORD_NUMBERS: Record<string, number> = {
  three: 3, five: 5, seven: 7, ten: 10, fourteen: 14, fifteen: 15, twenty: 20,
  'twenty one': 21, 'twenty-one': 21, thirty: 30, 'forty five': 45, 'forty-five': 45,
  sixty: 60, ninety: 90,
}

export function wordToNumber(word: string): number | null {
  const n = WORD_NUMBERS[word.trim().toLowerCase()]
  return n === undefined ? null : n
}

// Periods in these are not sentence ends: "Rs. 1,50,000", "cheque no. 4512", "Adv. S. Nair".
const ABBREVIATION_RE = /\b(?:Rs|No|Nos|Mr|Mrs|Ms|Dr|Adv|Sh|Smt|Shri|Sr|Jr|Ltd|Pvt|vs|Dt|Sec|Art|Ref|Regd|Approx|Est)\.|\b[A-Z]\./gi
const MASK = ''
const BOUNDARY_RE = /(?<=[.!?।;])\s+|\r?\n/g

/**
 * Sentence-ish slices of the ORIGINAL text (so every one is a verifiable quote). Abbreviation
 * periods are masked with a same-length placeholder before splitting, so offsets stay valid.
 */
export function splitSentences(text: string, minLength = 12): string[] {
  const masked = text.replace(ABBREVIATION_RE, (m) => m.slice(0, -1) + MASK)
  const parts: string[] = []
  let last = 0
  for (const m of masked.matchAll(BOUNDARY_RE)) {
    parts.push(text.slice(last, m.index))
    last = m.index + m[0].length
  }
  parts.push(text.slice(last))
  return parts.map((s) => s.trim()).filter((s) => s.length >= minLength)
}

const MONEY_RE = /(?:₹|Rs\.?|INR)\s?\d[\d,]*(?:\.\d+)?(?:\s?\/-)?/i

export function findMoney(sentence: string): string | null {
  const m = MONEY_RE.exec(sentence)
  return m ? m[0].trim() : null
}

// "within 15 days", "within fifteen (15) days", "within a period of 15 (fifteen) days"
const DAYS_RE =
  /within\s+(?:the\s+)?(?:a\s+)?(?:period\s+of\s+)?(?:(\d{1,3})|([a-z]+(?:[- ][a-z]+)?))\s*(?:\(\s*(\d{1,3}|[a-z][a-z\s-]*?)\s*\)\s*)?(?:calendar\s+|working\s+)?days?/i
const HINDI_DAYS_RE = /(\d{1,3})\s*दिन/

export type DayFrom = 'receipt' | 'notice_date' | 'other'

export interface DaysPhrase {
  days: number
  from: DayFrom
}

function inferFrom(sentence: string): DayFrom {
  if (/\b(receipt|receiving|received|receive|service of)\b|प्राप्ति/i.test(sentence)) return 'receipt'
  if (/date of (?:this|the) notice|date hereof|from the date of issue/i.test(sentence)) return 'notice_date'
  return 'other'
}

export function parseDaysPhrase(sentence: string): DaysPhrase | null {
  const m = DAYS_RE.exec(sentence)
  if (m) {
    let days: number | null = null
    if (m[1]) days = Number(m[1])
    else if (m[2]) days = wordToNumber(m[2])
    if (days === null && m[3]) days = /^\d+$/.test(m[3]) ? Number(m[3]) : wordToNumber(m[3])
    if (days !== null && Number.isInteger(days)) return { days, from: inferFrom(sentence) }
  }
  const h = HINDI_DAYS_RE.exec(sentence)
  if (h) return { days: Number(h[1]), from: inferFrom(sentence) }
  return null
}

const DMY_RE = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/g
const D_MONTH_Y_RE = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/g
const MONTH_D_Y_RE = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g

/** All calendar dates found in `text` as ISO strings (Indian day-first for numeric dates), in order. */
export function extractDates(text: string): IsoDate[] {
  const found: { index: number; iso: IsoDate }[] = []

  for (const m of text.matchAll(DMY_RE)) {
    const iso = buildIso(Number(m[3]), Number(m[2]), Number(m[1]))
    if (iso) found.push({ index: m.index, iso })
  }
  for (const m of text.matchAll(D_MONTH_Y_RE)) {
    const month = monthNumber(m[2])
    const iso = month ? buildIso(Number(m[3]), month, Number(m[1])) : null
    if (iso) found.push({ index: m.index, iso })
  }
  for (const m of text.matchAll(MONTH_D_Y_RE)) {
    const month = monthNumber(m[1])
    const iso = month ? buildIso(Number(m[3]), month, Number(m[2])) : null
    if (iso) found.push({ index: m.index, iso })
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.iso)
}

export const DEADLINE_CUE_RE = /\b(on or before|no later than|latest by|not later than|before|by|until|till)\b/i
export const NOTICE_DATE_LINE_RE = /^\s*(?:date[d]?|dated)\b/i
