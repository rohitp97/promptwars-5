import type { AnalysisResponse, IsoDate, ParsedAnalysis, RawDeadline, RawFinding, RawNotStated } from '../types'
import { isValidIso } from './dates'

export const LIMITS = {
  itemsPerSection: 12,
  text: 700,
  why: 500,
  quote: 900,
  label: 200,
  question: 400,
  lawyerQuestions: 8,
  notStated: 8,
  deadlines: 10,
} as const

const FINDING_KEYS = ['whatItIs', 'demands', 'senderClaims', 'consequences', 'options', 'doNow'] as const

type Rec = Record<string, unknown>
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Non-empty trimmed string within `max`, else null. */
function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 && t.length <= max ? t : null
}

/** Optional string: absent/null → null (ok); wrong type or over-long → undefined (malformed). */
function optionalText(v: unknown, max: number): string | null | undefined {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  if (t === '') return null
  return t.length <= max ? t : undefined
}

function parseFinding(v: unknown): RawFinding | null {
  if (!isRecord(v)) return null
  const t = text(v.text, LIMITS.text)
  const why = optionalText(v.why, LIMITS.why)
  const quote = optionalText(v.quote, LIMITS.quote)
  const playbookRef = optionalText(v.playbookRef, LIMITS.label)
  if (t === null || why === undefined || quote === undefined || playbookRef === undefined) return null
  return { text: t, why, quote, playbookRef }
}

const FROM_VALUES = ['receipt', 'notice_date', 'other'] as const

function parseDeadline(v: unknown): RawDeadline | null {
  if (!isRecord(v)) return null
  const label = text(v.label, LIMITS.label)
  const quote = text(v.quote, LIMITS.quote)
  if (label === null || quote === null) return null
  if (v.kind !== 'absolute' && v.kind !== 'relative') return null

  let date: IsoDate | null = null
  if (v.date !== undefined && v.date !== null) {
    if (typeof v.date !== 'string') return null
    date = isValidIso(v.date) ? v.date : null
  }

  let days: number | null = null
  if (v.days !== undefined && v.days !== null) {
    if (typeof v.days !== 'number' || !Number.isFinite(v.days)) return null
    days = Number.isInteger(v.days) ? v.days : null
  }

  let from: RawDeadline['from'] = null
  if (v.from !== undefined && v.from !== null) {
    if (typeof v.from !== 'string' || !FROM_VALUES.some((f) => f === v.from)) return null
    from = v.from as RawDeadline['from']
  }
  return { label, quote, kind: v.kind, date, days, from }
}

function parseNotStated(v: unknown): RawNotStated | null {
  if (!isRecord(v)) return null
  const question = text(v.question, LIMITS.question)
  const whyItMatters = text(v.whyItMatters, LIMITS.question)
  return question === null || whyItMatters === null ? null : { question, whyItMatters }
}

/**
 * Parse an array leniently at the item level (bad items are dropped and counted) but strictly at the
 * structural level: a section that is present but not an array means the whole response is unusable.
 * Returns null on structural failure.
 */
function parseList<T>(
  raw: unknown,
  parseItem: (v: unknown) => T | null,
  max: number,
  onMalformed: (n: number) => void,
): T[] | null {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) return null
  const out: T[] = []
  let bad = Math.max(0, raw.length - max)
  for (const item of raw.slice(0, max)) {
    const parsed = parseItem(item)
    if (parsed === null) bad++
    else out.push(parsed)
  }
  if (bad > 0) onMalformed(bad)
  return out
}

export function parseAnalysis(raw: unknown): ParsedAnalysis | null {
  if (!isRecord(raw)) return null
  const noticeType = text(raw.noticeType, 40)
  if (noticeType === null) return null

  let malformed = 0
  const count = (n: number) => {
    malformed += n
  }

  const response: AnalysisResponse = {
    noticeType,
    documentLanguage: text(raw.documentLanguage, 40) ?? 'Unknown',
    noticeDate: typeof raw.noticeDate === 'string' && isValidIso(raw.noticeDate) ? raw.noticeDate : null,
    noticeDateQuote: text(raw.noticeDateQuote, LIMITS.quote),
    whatItIs: [],
    demands: [],
    senderClaims: [],
    consequences: [],
    options: [],
    doNow: [],
    deadlines: [],
    notStated: [],
    lawyerQuestions: [],
  }

  for (const key of FINDING_KEYS) {
    const list = parseList(raw[key], parseFinding, LIMITS.itemsPerSection, count)
    if (list === null) return null
    response[key] = list
  }

  const deadlines = parseList(raw.deadlines, parseDeadline, LIMITS.deadlines, count)
  const notStated = parseList(raw.notStated, parseNotStated, LIMITS.notStated, count)
  const questions = parseList(raw.lawyerQuestions, (v) => text(v, LIMITS.question), LIMITS.lawyerQuestions, count)
  if (deadlines === null || notStated === null || questions === null) return null

  response.deadlines = deadlines
  response.notStated = notStated
  response.lawyerQuestions = questions
  return { response, malformed }
}
