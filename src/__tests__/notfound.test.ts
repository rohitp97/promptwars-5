// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildSamples } from '../data/samples'
import { assembleResult } from '../lib/analysis'
import { buildFallbackResponse, clip } from '../lib/fallback'
import type { AnalysisResponse } from '../types'

const samples = buildSamples('2026-10-12')
const text = (id: string) => samples.find((s) => s.id === id)!.text

const blank = (over: Partial<AnalysisResponse> = {}): AnalysisResponse => ({
  noticeType: 'other', documentLanguage: 'English', noticeDate: null, noticeDateQuote: null,
  whatItIs: [], demands: [], senderClaims: [], consequences: [], options: [], doNow: [],
  deadlines: [], notStated: [], lawyerQuestions: [], ...over,
})

const run = (response: AnalysisResponse, source: string) =>
  assembleResult({ response, malformed: 0, sourceText: source, receivedOn: '2026-10-10', today: '2026-10-12', source: 'gemini', fallbackReason: null })

describe('derived NOT FOUND entries', () => {
  it('flags a missing amount when the text contains no sum of money', () => {
    const r = run(blank(), 'Please remove the photograph from your website within 7 days of receipt.')
    expect(r.notStated.map((n) => n.question)).toContain('Does the notice state an amount?')
  })

  it('does not flag an amount when one is present', () => {
    const r = run(blank(), 'You owe Rs. 5,000 for the goods supplied to you in March.')
    expect(r.notStated.map((n) => n.question)).not.toContain('Does the notice state an amount?')
  })

  it('flags a missing notice date, and not when a verified one exists', () => {
    const src = 'Date: 6 October 2026\nYou owe Rs. 5,000 within 10 days of receipt of this notice.'
    const without = run(blank(), src)
    expect(without.notStated.map((n) => n.question)).toContain('Does the notice show its own date?')

    const withDate = run(blank({ noticeDate: '2026-10-06', noticeDateQuote: 'Date: 6 October 2026' }), src)
    expect(withDate.noticeDate).toBe('2026-10-06')
    expect(withDate.notStated.map((n) => n.question)).not.toContain('Does the notice show its own date?')
  })

  it('does not duplicate what the model already reported', () => {
    const r = run(
      blank({ notStated: [{ question: 'How much money is claimed?', whyItMatters: 'x' }, { question: 'What is the notice date?', whyItMatters: 'y' }] }),
      'A letter with no sums, dates or time limits at all in its text.',
    )
    const qs = r.notStated.map((n) => n.question)
    expect(qs.filter((q) => /much money|amount/i.test(q))).toHaveLength(1)
    expect(qs.filter((q) => /notice date|its own date/i.test(q))).toHaveLength(1)
  })

  it('shows all three gaps for the bundled "no playbook" sample', () => {
    const src = text('other')
    const r = run(buildFallbackResponse(src), src)
    // That sample states a date and a 7-day limit but no amount.
    expect(r.notStated.map((n) => n.question)).toContain('Does the notice state an amount?')
  })
})

describe('fallback quote quality', () => {
  it('clips long sentences at a word boundary, never mid-word', () => {
    const long = 'word '.repeat(200).trim()
    const c = clip(long)
    expect(c.length).toBeLessThanOrEqual(400)
    expect(c.endsWith('word')).toBe(true)
    expect(long.startsWith(c)).toBe(true)
  })

  it('leaves short sentences untouched and hard-cuts an unbroken string', () => {
    expect(clip('short one')).toBe('short one')
    expect(clip('x'.repeat(1000))).toHaveLength(400)
  })

  it('prefers the "called upon to pay" sentence over one that merely mentions an amount', () => {
    const src = text('cheque')
    const r = run(buildFallbackResponse(src), src)
    const quote = r.findings.demands[0].provenance.kind === 'document' ? r.findings.demands[0].provenance.quote : ''
    expect(quote).toMatch(/called upon to pay/)
  })

  it('every fallback quote for every sample still verifies after clipping', () => {
    for (const s of samples) {
      const r = run(buildFallbackResponse(s.text), s.text)
      expect(r.removed, s.id).toEqual([])
    }
  })
})
