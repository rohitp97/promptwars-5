import { GENERAL_GUIDANCE, getPlaybookEntry } from '../data/playbook'
import type { AnalysisResponse, RawDeadline, RawFinding } from '../types'
import {
  DEADLINE_CUE_RE,
  NOTICE_DATE_LINE_RE,
  extractDates,
  findMoney,
  parseDaysPhrase,
  splitSentences,
} from './extract'
import { detectNoticeType } from './retrieval'

const MAX_QUOTE = 400
const DEMAND_CUE_RE = /\b(pay|payment|called upon|demand|remit|discharge|repay|vacate|refund)\b|भुगतान/i

/** Cap a quote at a word boundary so it never ends mid-word. Still a prefix of the sentence, so it verifies. */
export function clip(s: string): string {
  if (s.length <= MAX_QUOTE) return s
  const cut = s.slice(0, MAX_QUOTE)
  const space = cut.lastIndexOf(' ')
  return (space > MAX_QUOTE / 2 ? cut.slice(0, space) : cut).trimEnd()
}

const GENERIC_LAWYER_QUESTIONS = [
  'What kind of notice is this, and how serious is it?',
  'What is my deadline to respond, and what happens if I miss it?',
  'Which documents should I bring to the first meeting?',
]

/**
 * Rule-based reading used when the AI is unavailable or its answer can't be verified. It only
 * ever produces claims whose quote is a slice of the notice, so it passes the same verifier as the
 * model's output. It is deliberately modest: keywords, amounts, "within N days", and dates.
 */
export function buildFallbackResponse(sourceText: string): AnalysisResponse {
  const detection = detectNoticeType(sourceText)
  const entry = getPlaybookEntry(detection.type)
  const sentences = splitSentences(sourceText)

  const whatItIs: RawFinding[] = []
  const demands: RawFinding[] = []
  const deadlines: RawDeadline[] = []
  let noticeDate: string | null = null
  let noticeDateQuote: string | null = null

  if (entry) {
    const cue = sentences.find((s) => detection.matched.some((t) => s.toLowerCase().includes(t.toLowerCase())))
    if (cue) {
      whatItIs.push({
        text: `This looks like a ${entry.title.toLowerCase()} (keywords found: ${detection.matched.slice(0, 3).join(', ')}). This is a keyword-based reading, not an AI summary.`,
        why: null,
        quote: clip(cue),
        playbookRef: null,
      })
    }
  }

  // Prefer the sentence that actually demands payment over one that merely mentions an amount.
  const moneySentence = sentences.find((s) => findMoney(s) !== null && DEMAND_CUE_RE.test(s)) ?? sentences.find((s) => findMoney(s) !== null)
  if (moneySentence) {
    demands.push({
      text: `The notice mentions an amount: ${findMoney(moneySentence)}.`,
      why: 'Check whether this matches your own records.',
      quote: clip(moneySentence),
      playbookRef: null,
    })
  }

  for (const sentence of sentences) {
    const dates = extractDates(sentence)
    if (dates.length > 0 && NOTICE_DATE_LINE_RE.test(sentence) && noticeDate === null) {
      noticeDate = dates[0]
      noticeDateQuote = clip(sentence)
      continue
    }
    if (dates.length > 0 && DEADLINE_CUE_RE.test(sentence)) {
      deadlines.push({
        label: 'A date stated in the notice',
        quote: clip(sentence),
        kind: 'absolute',
        date: dates[0],
        days: null,
        from: null,
      })
      continue
    }
    const phrase = parseDaysPhrase(sentence)
    if (phrase) {
      deadlines.push({
        label: `A ${phrase.days}-day time limit stated in the notice`,
        quote: clip(sentence),
        kind: 'relative',
        date: null,
        days: phrase.days,
        from: phrase.from,
      })
    }
  }

  const options: RawFinding[] = (entry?.options ?? []).slice(0, 3).map((o) => ({
    text: o.text,
    why: null,
    quote: null,
    playbookRef: o.id,
  }))

  const doNow: RawFinding[] = []
  if (deadlines[0]) {
    doNow.push({
      text: 'Find the time limit in this notice and count it from the day you received it.',
      why: null,
      quote: deadlines[0].quote,
      playbookRef: null,
    })
  }
  if (entry) {
    for (const d of entry.documents.slice(0, 3)) {
      doNow.push({ text: `Gather: ${d.text}`, why: null, quote: null, playbookRef: d.id })
    }
    if (entry.pitfalls[0]) {
      doNow.push({ text: entry.pitfalls[0].text, why: null, quote: null, playbookRef: entry.pitfalls[0].id })
    }
  } else {
    // No curated type: still give sourced, procedural next steps instead of nothing.
    for (const g of GENERAL_GUIDANCE.filter((x) => x.id !== 'general.do.read')) {
      doNow.push({ text: g.text, why: null, quote: null, playbookRef: g.id })
    }
  }

  return {
    noticeType: detection.type,
    documentLanguage: /[ऀ-ॿ]/.test(sourceText) ? 'Hindi' : 'English',
    noticeDate,
    noticeDateQuote,
    whatItIs,
    demands,
    senderClaims: [],
    consequences: [],
    options,
    doNow,
    deadlines,
    notStated: [],
    lawyerQuestions: entry?.lawyerQuestions ?? GENERIC_LAWYER_QUESTIONS,
  }
}
