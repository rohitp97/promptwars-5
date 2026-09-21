// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildSamples } from '../data/samples'
import { assembleResult, isUnusable, verifyNoticeDate } from '../lib/analysis'
import { buildFallbackResponse } from '../lib/fallback'
import { detectNoticeType } from '../lib/retrieval'
import { prepareSource } from '../lib/verify'
import { parseAnalysis } from '../lib/validation'
import type { AnalysisResponse } from '../types'

const TODAY = '2026-10-12'
const samples = buildSamples(TODAY)
const byId = (id: string) => samples.find((s) => s.id === id)!

const blank = (over: Partial<AnalysisResponse> = {}): AnalysisResponse => ({
  noticeType: 'cheque_bounce', documentLanguage: 'English', noticeDate: null, noticeDateQuote: null,
  whatItIs: [], demands: [], senderClaims: [], consequences: [], options: [], doNow: [],
  deadlines: [], notStated: [], lawyerQuestions: [], ...over,
})

const run = (response: AnalysisResponse, text: string, over = {}) =>
  assembleResult({ response, malformed: 0, sourceText: text, receivedOn: '2026-10-10', today: TODAY, source: 'gemini', fallbackReason: null, ...over })

describe('assembleResult — trust layer end to end', () => {
  const text = byId('cheque').text

  it('keeps verified claims, removes invented ones, and counts both', () => {
    const r = run(
      blank({
        whatItIs: [{ text: 'A cheque-bounce demand.', why: null, quote: 'LEGAL NOTICE UNDER SECTION 138 OF THE NEGOTIABLE INSTRUMENTS ACT, 1881', playbookRef: null }],
        demands: [
          { text: 'Pay Rs. 1,50,000.', why: null, quote: 'pay the said sum of Rs. 1,50,000/- to my client within 15 days', playbookRef: null },
          { text: 'Pay Rs. 9,00,000.', why: null, quote: 'you must pay Rs. 9,00,000 by Friday without exception', playbookRef: null },
        ],
        options: [
          { text: 'Pay within the window.', why: null, quote: null, playbookRef: 'cheque_bounce.opt.pay' },
          { text: 'Sue them.', why: null, quote: null, playbookRef: 'cheque_bounce.opt.invented' },
        ],
      }),
      text,
    )
    expect(r.findings.whatItIs).toHaveLength(1)
    expect(r.findings.demands).toHaveLength(1)
    expect(r.findings.options).toHaveLength(1)
    expect(r.removed.map((x) => x.text)).toEqual(['Pay Rs. 9,00,000.', 'Sue them.'])
    // verified: 1 whatItIs + 1 demand. playbook: 1 kept option + the 2 statutory cheque-bounce dates.
    expect(r.summary).toEqual({ checked: 7, verified: 2, approximate: 0, playbook: 3, removed: 2 })
  })

  it('computes both the stated and the statutory dates from the receipt date', () => {
    const r = run(
      blank({
        deadlines: [{ label: 'Pay Rs. 1,50,000', quote: 'within 15 days of receipt of this notice', kind: 'relative', date: null, days: 15, from: 'receipt' }],
      }),
      text,
    )
    const dates = r.deadlines.map((d) => [d.origin, d.date])
    expect(dates).toContainEqual(['notice', '2026-10-25'])
    expect(dates).toContainEqual(['statute', '2026-10-25'])
    expect(dates).toContainEqual(['statute', '2026-11-25'])
    expect(r.urgency.level).toBe('moderate')
  })

  it('treats an invented notice type as "other": no playbook, no guidance', () => {
    const r = run(
      blank({
        noticeType: 'tax_evasion',
        options: [{ text: 'x', why: null, quote: null, playbookRef: 'cheque_bounce.opt.pay' }],
      }),
      text,
    )
    expect(r.noticeType).toBe('other')
    expect(r.findings.options).toHaveLength(0)
    expect(r.deadlines.filter((d) => d.origin === 'statute')).toHaveLength(0)
  })

  it('rejects a playbook ref that belongs to a different notice type', () => {
    const r = run(blank({ noticeType: 'eviction_rent', options: [{ text: 'x', why: null, quote: null, playbookRef: 'cheque_bounce.opt.pay' }] }), text)
    expect(r.findings.options).toHaveLength(0)
    expect(r.removed[0].reason).toMatch(/not in the built-in playbook/)
  })

  it('adds a NOT FOUND entry when the notice states no deadline', () => {
    const r = run(blank(), 'This is a letter with nothing about time limits in it at all.')
    expect(r.notStated.some((n) => /deadline/i.test(n.question))).toBe(true)
  })

  it('does not duplicate a NOT FOUND deadline entry the model already gave', () => {
    const r = run(blank({ notStated: [{ question: 'What is the deadline?', whyItMatters: 'x' }] }), 'No timing here at all in this text.')
    expect(r.notStated.filter((n) => /deadline/i.test(n.question))).toHaveLength(1)
  })

  it('reports malformed model items in the removed list', () => {
    const r = run(blank(), text, { malformed: 3 })
    expect(r.removed.at(-1)).toMatchObject({ section: 'malformed' })
    expect(r.summary.removed).toBe(1)
  })

  it('dedupes lawyer questions across the model and the playbook', () => {
    const q = 'Do I have a defence that there was no legally enforceable debt or liability?'
    const r = run(blank({ lawyerQuestions: [q.toUpperCase(), 'A brand new question?'] }), text)
    expect(r.lawyerQuestions.filter((x) => x.toLowerCase() === q.toLowerCase())).toHaveLength(1)
    expect(r.lawyerQuestions).toContain('A brand new question?')
  })

  it('flags an answer as unusable when nothing survives verification', () => {
    const r = run(blank({ demands: [{ text: 'x', why: null, quote: 'entirely fabricated sentence about money', playbookRef: null }] }), text)
    expect(isUnusable(r)).toBe(true)
    expect(isUnusable(run(blank(), text))).toBe(false)
  })
})

describe('verifyNoticeDate', () => {
  const src = prepareSource(`Date: 6 October 2026\n\nYou must pay.`)
  it('accepts a date backed by a verified quote that contains it', () => {
    expect(verifyNoticeDate(blank({ noticeDate: '2026-10-06', noticeDateQuote: 'Date: 6 October 2026' }), src)).toBe('2026-10-06')
  })
  it('rejects a date the quote does not contain', () => {
    expect(verifyNoticeDate(blank({ noticeDate: '2026-10-07', noticeDateQuote: 'Date: 6 October 2026' }), src)).toBeNull()
  })
  it('rejects a date with a fabricated quote or no quote', () => {
    expect(verifyNoticeDate(blank({ noticeDate: '2026-10-06', noticeDateQuote: 'Dated the sixth day of October' }), src)).toBeNull()
    expect(verifyNoticeDate(blank({ noticeDate: '2026-10-06', noticeDateQuote: null }), src)).toBeNull()
    expect(verifyNoticeDate(blank({ noticeDate: null, noticeDateQuote: 'Date: 6 October 2026' }), src)).toBeNull()
  })
})

describe('detectNoticeType and the bundled samples', () => {
  it.each([
    ['cheque', 'cheque_bounce'], ['cheque-hi', 'cheque_bounce'], ['rent', 'eviction_rent'], ['bank', 'loan_recovery'], ['other', 'other'],
  ])('sample %s is detected as %s', (id, type) => {
    expect(detectNoticeType(byId(id).text).type).toBe(type)
  })

  it('does not classify a single weak keyword', () => {
    expect(detectNoticeType('We have a bond of friendship.').type).toBe('other')
    expect(detectNoticeType('').type).toBe('other')
  })
})

describe('rule-based fallback goes through the same verifier', () => {
  it.each(samples.filter((s) => s.id !== 'other').map((s) => [s.id, s.text]))('%s: every fallback claim verifies', (_id, text) => {
    const r = run(buildFallbackResponse(text), text, { source: 'fallback' })
    expect(r.removed).toEqual([])
    expect(r.summary.verified + r.summary.approximate).toBeGreaterThan(0)
    expect(r.deadlines.some((d) => d.origin === 'notice')).toBe(true)
  })

  it('finds the 15-day limit, the amount and the notice date in the English cheque sample', () => {
    const text = byId('cheque').text
    const r = run(buildFallbackResponse(text), text, { source: 'fallback' })
    expect(r.deadlines.find((d) => d.origin === 'notice')?.date).toBe('2026-10-25')
    expect(r.findings.demands[0].text).toContain('Rs. 1,50,000')
    expect(r.noticeDate).toBe('2026-10-08')
  })

  it('reads the Hindi sample: type, amount and the 15-day limit', () => {
    const text = byId('cheque-hi').text
    const r = run(buildFallbackResponse(text), text, { source: 'fallback' })
    expect(r.noticeType).toBe('cheque_bounce')
    expect(r.documentLanguage).toBe('Hindi')
    expect(r.deadlines.find((d) => d.origin === 'notice')?.date).toBe('2026-10-25')
  })

  it('finds an absolute date in the eviction sample and gives it a real date', () => {
    const text = byId('rent').text
    const r = run(buildFallbackResponse(text), text, { source: 'fallback' })
    expect(r.deadlines.find((d) => d.origin === 'notice')?.date).toBe('2026-11-11')
  })

  it('offers no playbook guidance for an unrecognised notice and says nothing is known', () => {
    const text = byId('other').text
    const r = run(buildFallbackResponse(text), text, { source: 'fallback' })
    expect(r.noticeType).toBe('other')
    expect(r.findings.options).toHaveLength(0)
    expect(r.lawyerQuestions.length).toBeGreaterThan(0)
  })

  it('survives empty and gibberish input without throwing', () => {
    for (const text of ['', '   ', '12345 !!! ???', 'a'.repeat(50_000)]) {
      const r = run(buildFallbackResponse(text), text, { source: 'fallback' })
      expect(r.urgency.level).toBe('unknown')
    }
  })
})

describe('end to end with a raw model payload', () => {
  it('parses, verifies and resolves a realistic Gemini-shaped response', () => {
    const text = byId('rent').text
    const raw = {
      noticeType: 'eviction_rent', documentLanguage: 'English', noticeDate: '2026-10-08', noticeDateQuote: 'Date: 8 October 2026',
      whatItIs: [{ text: 'Your landlord wants you to leave.', why: null, quote: 'I hereby terminate your tenancy and require you to vacate the premises', playbookRef: null }],
      demands: [{ text: 'Leave by 11 November.', why: null, quote: 'on or before 11 November 2026', playbookRef: null }],
      options: [{ text: 'Reply in writing.', why: null, quote: null, playbookRef: 'eviction_rent.opt.reply' }],
      deadlines: [{ label: 'Vacate', quote: 'on or before 11 November 2026', kind: 'absolute', date: '2026-11-11', days: null, from: null }],
      notStated: [], lawyerQuestions: ['Is the notice period valid?'],
    }
    const parsed = parseAnalysis(raw)
    expect(parsed).not.toBeNull()
    const r = run(parsed!.response, text, { malformed: parsed!.malformed })
    expect(r.noticeDate).toBe('2026-10-08')
    expect(r.deadlines[0]).toMatchObject({ origin: 'notice', date: '2026-11-11' })
    expect(r.urgency.level).toBe('low')
    expect(r.removed).toEqual([])
  })
})
