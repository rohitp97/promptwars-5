import { buildRefIndex, getPlaybookEntry, isNoticeTypeId } from '../data/playbook'
import type {
  AnalysisResponse,
  AnalysisResult,
  AnalysisSource,
  IsoDate,
  NoticeType,
  RawNotStated,
  RemovedFinding,
  ResolvedDeadline,
  VerificationSummary,
  VerifiedFinding,
  FindingSection,
} from '../types'
import { resolveNoticeDeadlines, resolveStatutoryDeadlines, sortDeadlines } from './deadlines'
import type { DeadlineContext } from './deadlines'
import { extractDates, findMoney } from './extract'
import { deriveUrgency } from './urgency'
import { FINDING_SECTIONS, prepareSource, verifyFindings, verifyQuote } from './verify'
import type { PreparedSource } from './verify'

export interface AssembleInput {
  response: AnalysisResponse
  malformed: number
  sourceText: string
  receivedOn: IsoDate
  today: IsoDate
  source: AnalysisSource
  fallbackReason: string | null
}

const MAX_LAWYER_QUESTIONS = 10
const DEADLINE_WORDS = /deadline|time limit|within|days|by when/i
const AMOUNT_WORDS = /amount|sum|how much|money|rs\.?|₹/i
const DATE_WORDS = /notice date|dated|date of the notice|date on the notice|its own date/i

/**
 * The notice date feeds "N days from the date of the notice", so it can't be an unchecked claim:
 * it needs a verified quote, and a date in that quote that the rules can read and that agrees.
 */
export function verifyNoticeDate(response: AnalysisResponse, src: PreparedSource): IsoDate | null {
  if (response.noticeDate === null || response.noticeDateQuote === null) return null
  const match = verifyQuote(response.noticeDateQuote, src)
  if (match.status === 'unverified') return null
  const quoted = src.original.slice(match.start, match.end)
  return extractDates(quoted).includes(response.noticeDate) ? response.noticeDate : null
}

function summarise(
  findings: Record<FindingSection, VerifiedFinding[]>,
  deadlines: readonly ResolvedDeadline[],
  removedCount: number,
): VerificationSummary {
  let verified = 0
  let approximate = 0
  let playbook = 0
  const count = (p: VerifiedFinding['provenance'] | ResolvedDeadline['provenance']) => {
    if (p.kind === 'playbook') playbook++
    else if (p.status === 'verified') verified++
    else approximate++
  }
  for (const section of FINDING_SECTIONS) findings[section].forEach((f) => count(f.provenance))
  deadlines.forEach((d) => count(d.provenance))
  return {
    checked: verified + approximate + playbook + removedCount,
    verified,
    approximate,
    playbook,
    removed: removedCount,
  }
}

/** NOT FOUND entries the code can be certain of, added on top of what the model lists. */
function deriveNotStated(
  response: AnalysisResponse,
  deadlines: readonly ResolvedDeadline[],
  sourceText: string,
  noticeDate: IsoDate | null,
): RawNotStated[] {
  const out = [...response.notStated]
  const mentions = (re: RegExp) => out.some((n) => re.test(n.question))

  if (!deadlines.some((d) => d.origin === 'notice') && !mentions(DEADLINE_WORDS)) {
    out.push({
      question: 'Does the notice state a deadline to respond?',
      whyItMatters:
        'No time limit was found in the notice text. Some legal time limits apply even when a notice does not mention them, so ask a lawyer.',
    })
  }
  if (findMoney(sourceText) === null && !mentions(AMOUNT_WORDS)) {
    out.push({
      question: 'Does the notice state an amount?',
      whyItMatters:
        'No sum of money was found. If you are being asked to pay, you will want the exact figure and how it was worked out.',
    })
  }
  if (noticeDate === null && !mentions(DATE_WORDS)) {
    out.push({
      question: 'Does the notice show its own date?',
      whyItMatters:
        'A notice date could not be confirmed. Some time limits count from it, so the app used the date you said you received it.',
    })
  }
  return out
}

function mergeQuestions(response: AnalysisResponse, type: NoticeType): string[] {
  const entry = getPlaybookEntry(type)
  const seen = new Set<string>()
  const out: string[] = []
  for (const q of [...response.lawyerQuestions, ...(entry?.lawyerQuestions ?? [])]) {
    const key = q.trim().toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      out.push(q)
    }
  }
  return out.slice(0, MAX_LAWYER_QUESTIONS)
}

/**
 * Everything after the model call: verify, resolve dates, derive urgency. Pure — the same
 * (response, source text, receipt date, today) always produce the same result.
 */
export function assembleResult(input: AssembleInput): AnalysisResult {
  const { response, sourceText, receivedOn, today } = input

  // A type the model made up is treated as 'other': no playbook, no guidance.
  const noticeType: NoticeType = isNoticeTypeId(response.noticeType) ? response.noticeType : 'other'
  const entry = getPlaybookEntry(noticeType)
  const src = prepareSource(sourceText)

  const { findings, removed } = verifyFindings(response, src, buildRefIndex(entry))
  const noticeDate = verifyNoticeDate(response, src)
  const ctx: DeadlineContext = { receivedOn, noticeDate, today }

  const stated = resolveNoticeDeadlines(response.deadlines, src, ctx)
  const deadlines = sortDeadlines([...stated.deadlines, ...resolveStatutoryDeadlines(entry, ctx)])

  const allRemoved: RemovedFinding[] = [...removed, ...stated.removed]
  if (input.malformed > 0) {
    allRemoved.push({
      section: 'malformed',
      text: `${input.malformed} item${input.malformed === 1 ? '' : 's'} in the AI response`,
      reason: 'Did not match the expected format and was skipped',
    })
  }

  return {
    source: input.source,
    fallbackReason: input.fallbackReason,
    noticeType,
    documentLanguage: response.documentLanguage,
    noticeDate,
    receivedOn,
    analysedOn: today,
    sourceText,
    findings,
    deadlines,
    urgency: deriveUrgency(deadlines, today),
    notStated: deriveNotStated(response, deadlines, sourceText, noticeDate),
    lawyerQuestions: mergeQuestions(response, noticeType),
    removed: allRemoved,
    summary: summarise(findings, deadlines, allRemoved.length),
  }
}

/**
 * If the model's answer was mostly unverifiable there is nothing trustworthy to show; better to drop
 * to the rule-based reading (which is verifiable by construction) and say so.
 */
export function isUnusable(result: AnalysisResult): boolean {
  const trusted = result.summary.verified + result.summary.approximate
  return trusted === 0 && result.summary.removed > 0
}
