// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { LIMITS, parseAnalysis } from '../lib/validation'

const finding = (over: Record<string, unknown> = {}) => ({
  text: 'You are asked to pay Rs. 50,000.',
  why: null,
  quote: 'pay Rs. 50,000 within 15 days',
  playbookRef: null,
  ...over,
})

const valid = (over: Record<string, unknown> = {}) => ({
  noticeType: 'cheque_bounce',
  documentLanguage: 'English',
  noticeDate: null,
  noticeDateQuote: null,
  whatItIs: [finding()],
  demands: [],
  senderClaims: [],
  consequences: [],
  options: [],
  doNow: [],
  deadlines: [
    { label: 'Pay', quote: 'within 15 days of receipt', kind: 'relative', date: null, days: 15, from: 'receipt' },
  ],
  notStated: [{ question: 'Which cheque?', whyItMatters: 'No number given.' }],
  lawyerQuestions: ['Was the notice sent in time?'],
  ...over,
})

describe('parseAnalysis — structure', () => {
  it('accepts a complete valid response', () => {
    const r = parseAnalysis(valid())
    expect(r).not.toBeNull()
    expect(r?.malformed).toBe(0)
    expect(r?.response.deadlines[0]).toMatchObject({ days: 15, from: 'receipt', kind: 'relative' })
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'json'],
    ['a number', 42],
    ['an array', []],
  ])('rejects %s', (_n, raw) => {
    expect(parseAnalysis(raw)).toBeNull()
  })

  it('rejects a missing, empty or non-string noticeType', () => {
    expect(parseAnalysis(valid({ noticeType: undefined }))).toBeNull()
    expect(parseAnalysis(valid({ noticeType: '' }))).toBeNull()
    expect(parseAnalysis(valid({ noticeType: 7 }))).toBeNull()
    expect(parseAnalysis(valid({ noticeType: 'x'.repeat(41) }))).toBeNull()
  })

  it('rejects a section that is present but not an array', () => {
    expect(parseAnalysis(valid({ whatItIs: 'text' }))).toBeNull()
    expect(parseAnalysis(valid({ demands: { a: 1 } }))).toBeNull()
    expect(parseAnalysis(valid({ deadlines: 'soon' }))).toBeNull()
    expect(parseAnalysis(valid({ notStated: 3 }))).toBeNull()
    expect(parseAnalysis(valid({ lawyerQuestions: 'ask' }))).toBeNull()
  })

  it('treats absent sections as empty rather than failing', () => {
    const r = parseAnalysis({ noticeType: 'other' })
    expect(r?.response.whatItIs).toEqual([])
    expect(r?.response.documentLanguage).toBe('Unknown')
  })

  it('ignores extra unknown fields', () => {
    expect(parseAnalysis(valid({ surprise: { nested: true } }))).not.toBeNull()
  })
})

describe('parseAnalysis — items', () => {
  it('drops malformed findings and counts them', () => {
    const r = parseAnalysis(
      valid({
        demands: [finding(), { why: 'no text' }, 'string', null, finding({ quote: 5 }), finding({ text: '' })],
      }),
    )
    expect(r?.response.demands).toHaveLength(1)
    expect(r?.malformed).toBe(5)
  })

  it('rejects findings with over-long fields', () => {
    const r = parseAnalysis(
      valid({
        demands: [finding({ text: 'x'.repeat(LIMITS.text + 1) }), finding({ quote: 'q'.repeat(LIMITS.quote + 1) })],
      }),
    )
    expect(r?.response.demands).toHaveLength(0)
    expect(r?.malformed).toBe(2)
  })

  it('caps items per section and counts the overflow', () => {
    const many = Array.from({ length: LIMITS.itemsPerSection + 5 }, () => finding())
    const r = parseAnalysis(valid({ demands: many }))
    expect(r?.response.demands).toHaveLength(LIMITS.itemsPerSection)
    expect(r?.malformed).toBe(5)
  })

  it('normalises empty-string optional fields to null', () => {
    const r = parseAnalysis(valid({ whatItIs: [finding({ why: '  ', quote: '', playbookRef: '' })] }))
    expect(r?.response.whatItIs[0]).toMatchObject({ why: null, quote: null, playbookRef: null })
  })

  it('validates deadline fields', () => {
    const bad = [
      { label: 'x', quote: 'q'.repeat(12), kind: 'weekly' },
      { label: 'x', quote: 'q'.repeat(12), kind: 'relative', days: 'ten' },
      { label: 'x', quote: 'q'.repeat(12), kind: 'relative', days: Infinity },
      { label: 'x', quote: 'q'.repeat(12), kind: 'relative', from: 'tomorrow' },
      { label: 'x', quote: 'q'.repeat(12), kind: 'absolute', date: 20261012 },
      { label: '', quote: 'q'.repeat(12), kind: 'absolute' },
      { label: 'x', kind: 'absolute' },
    ]
    const r = parseAnalysis(valid({ deadlines: bad }))
    expect(r?.response.deadlines).toHaveLength(0)
    expect(r?.malformed).toBe(bad.length)
  })

  it('nulls an impossible date and a fractional day count instead of trusting them', () => {
    const r = parseAnalysis(
      valid({
        deadlines: [
          { label: 'a', quote: 'q'.repeat(12), kind: 'absolute', date: '2026-02-30' },
          { label: 'b', quote: 'q'.repeat(12), kind: 'relative', days: 7.5, from: 'receipt' },
        ],
      }),
    )
    expect(r?.response.deadlines[0].date).toBeNull()
    expect(r?.response.deadlines[1].days).toBeNull()
  })

  it('drops a notice date that is not a real ISO date', () => {
    expect(parseAnalysis(valid({ noticeDate: '2026-02-30' }))?.response.noticeDate).toBeNull()
    expect(parseAnalysis(valid({ noticeDate: '12 Oct 2026' }))?.response.noticeDate).toBeNull()
    expect(parseAnalysis(valid({ noticeDate: '2026-10-12' }))?.response.noticeDate).toBe('2026-10-12')
  })

  it('filters non-string lawyer questions', () => {
    const r = parseAnalysis(valid({ lawyerQuestions: ['ok question here', 5, null, ''] }))
    expect(r?.response.lawyerQuestions).toEqual(['ok question here'])
    expect(r?.malformed).toBe(3)
  })
})
