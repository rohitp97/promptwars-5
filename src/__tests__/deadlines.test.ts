// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getPlaybookEntry } from '../data/playbook'
import {
  crossCheckDeadline,
  daysLeft,
  resolveNoticeDeadlines,
  resolveRawDeadline,
  resolveStatutoryDeadlines,
  sortDeadlines,
} from '../lib/deadlines'
import type { DeadlineContext } from '../lib/deadlines'
import { deriveUrgency } from '../lib/urgency'
import { prepareSource } from '../lib/verify'
import type { RawDeadline, ResolvedDeadline } from '../types'

const ctx: DeadlineContext = { receivedOn: '2026-10-10', noticeDate: '2026-10-06', today: '2026-10-12' }

const rel = (over: Partial<RawDeadline> = {}): RawDeadline => ({
  label: 'Pay',
  quote: 'within 15 days of receipt of this notice',
  kind: 'relative',
  date: null,
  days: 15,
  from: 'receipt',
  ...over,
})

describe('resolveRawDeadline', () => {
  it('counts relative days from the receipt date', () => {
    expect(resolveRawDeadline(rel(), ctx).date).toBe('2026-10-25')
  })

  it('counts from the notice date when stated', () => {
    expect(resolveRawDeadline(rel({ from: 'notice_date' }), ctx).date).toBe('2026-10-21')
  })

  it('gives no date when counting from a notice date the notice does not state', () => {
    const r = resolveRawDeadline(rel({ from: 'notice_date' }), { ...ctx, noticeDate: null })
    expect(r.date).toBeNull()
    expect(r.basis).toMatch(/does not state its date/)
  })

  it('gives no date when the anchor is some other event', () => {
    expect(resolveRawDeadline(rel({ from: 'other' }), ctx).date).toBeNull()
    expect(resolveRawDeadline(rel({ from: null }), ctx).date).toBeNull()
  })

  it('rejects days that are missing, negative, fractional or absurd', () => {
    for (const days of [null, -1, 1.5, 4000, Number.NaN]) {
      expect(resolveRawDeadline(rel({ days }), ctx).date, String(days)).toBeNull()
    }
  })

  it('accepts zero days (due on receipt)', () => {
    expect(resolveRawDeadline(rel({ days: 0 }), ctx).date).toBe('2026-10-10')
  })

  it('uses a valid absolute date and rejects an invalid one', () => {
    expect(resolveRawDeadline({ ...rel(), kind: 'absolute', date: '2026-11-05', days: null }, ctx).date).toBe(
      '2026-11-05',
    )
    expect(resolveRawDeadline({ ...rel(), kind: 'absolute', date: null, days: null }, ctx).date).toBeNull()
  })

  it('handles a month-end receipt date across a leap year', () => {
    const r = resolveRawDeadline(rel({ days: 30 }), { ...ctx, receivedOn: '2028-02-01' })
    expect(r.date).toBe('2028-03-02')
  })
})

describe('crossCheckDeadline', () => {
  it('matches when the day count agrees with the quote, including number words', () => {
    expect(crossCheckDeadline(rel(), 'within 15 days of receipt')).toBe('match')
    expect(crossCheckDeadline(rel({ days: 15 }), 'within fifteen (15) days of receipt')).toBe('match')
    expect(crossCheckDeadline(rel({ days: 30 }), 'within thirty days')).toBe('match')
  })

  it('flags a mismatch between the model number and the quote', () => {
    expect(crossCheckDeadline(rel({ days: 30 }), 'within 15 days of receipt')).toBe('mismatch')
  })

  it('is unchecked when the wording is not recognised', () => {
    expect(crossCheckDeadline(rel(), 'by the fifteenth day after service')).toBe('unchecked')
  })

  it('cross-checks absolute dates against dates in the quote', () => {
    const abs: RawDeadline = { ...rel(), kind: 'absolute', date: '2026-11-05', days: null }
    expect(crossCheckDeadline(abs, 'vacate on or before 5 November 2026')).toBe('match')
    expect(crossCheckDeadline(abs, 'vacate on or before 05/11/2026')).toBe('match')
    expect(crossCheckDeadline(abs, 'vacate on or before 6 November 2026')).toBe('mismatch')
    expect(crossCheckDeadline(abs, 'vacate immediately')).toBe('unchecked')
  })
})

describe('resolveNoticeDeadlines', () => {
  const src = prepareSource(
    'You must pay within 15 days of receipt of this notice. Vacate on or before 5 November 2026.',
  )

  it('keeps verified deadlines with document provenance', () => {
    const { deadlines, removed } = resolveNoticeDeadlines([rel()], src, ctx)
    expect(removed).toEqual([])
    expect(deadlines[0].date).toBe('2026-10-25')
    expect(deadlines[0].provenance.kind).toBe('document')
  })

  it('removes a deadline whose quote is not in the notice', () => {
    const { deadlines, removed } = resolveNoticeDeadlines(
      [rel({ quote: 'within 90 days of the agreement date' })],
      src,
      ctx,
    )
    expect(deadlines).toHaveLength(0)
    expect(removed[0]).toMatchObject({ section: 'deadlines', reason: 'Quote not found in the notice' })
  })

  it('drops the date (but keeps the deadline) when the model number disagrees with the quote', () => {
    const { deadlines } = resolveNoticeDeadlines([rel({ days: 45 })], src, ctx)
    expect(deadlines[0].date).toBeNull()
    expect(deadlines[0].basis).toMatch(/does not match the quote/)
  })

  it('warns when the date could not be double-checked', () => {
    const s = prepareSource('Pay by the fifteenth day after you receive this letter of demand.')
    const { deadlines } = resolveNoticeDeadlines(
      [rel({ quote: 'by the fifteenth day after you receive this letter' })],
      s,
      ctx,
    )
    expect(deadlines[0].date).toBe('2026-10-25')
    expect(deadlines[0].basis).toMatch(/confirm it against the quote/)
  })
})

describe('resolveStatutoryDeadlines', () => {
  it('computes the cheque-bounce payment window and complaint window from receipt', () => {
    const list = resolveStatutoryDeadlines(getPlaybookEntry('cheque_bounce'), ctx)
    expect(list.map((d) => d.date)).toEqual(['2026-10-25', '2026-11-25'])
    expect(list.every((d) => d.origin === 'statute' && d.provenance.kind === 'playbook')).toBe(true)
  })

  it('clamps the complaint window at month-end', () => {
    const list = resolveStatutoryDeadlines(getPlaybookEntry('cheque_bounce'), { ...ctx, receivedOn: '2026-01-16' })
    // 16 Jan + 15d = 31 Jan; + 1 month = 28 Feb
    expect(list.map((d) => d.date)).toEqual(['2026-01-31', '2026-02-28'])
  })

  it('computes the SARFAESI 60-day period and leaves event-anchored limits undated', () => {
    const list = resolveStatutoryDeadlines(getPlaybookEntry('loan_recovery'), ctx)
    expect(list[0].date).toBe('2026-12-09')
    expect(list[1].date).toBeNull()
    expect(list[1].basis).toMatch(/counted from the bank/i)
  })

  it('returns nothing when there is no playbook entry', () => {
    expect(resolveStatutoryDeadlines(null, ctx)).toEqual([])
  })
})

describe('daysLeft, sortDeadlines and urgency', () => {
  const mk = (id: string, date: string | null, label = id): ResolvedDeadline => ({
    id,
    label,
    origin: 'notice',
    date,
    basis: '',
    provenance: { kind: 'playbook', ref: id, refLabel: id },
  })

  it('computes signed days left and null for undated', () => {
    expect(daysLeft(mk('a', '2026-10-25'), '2026-10-12')).toBe(13)
    expect(daysLeft(mk('a', '2026-10-10'), '2026-10-12')).toBe(-2)
    expect(daysLeft(mk('a', null), '2026-10-12')).toBeNull()
  })

  it('sorts dated deadlines ascending with undated last', () => {
    const sorted = sortDeadlines([mk('c', null), mk('b', '2026-11-01'), mk('a', '2026-10-20')])
    expect(sorted.map((d) => d.id)).toEqual(['a', 'b', 'c'])
  })

  it.each([
    ['2026-10-12', 'critical', 'today'],
    ['2026-10-15', 'critical', '3 days'],
    ['2026-10-16', 'high', '4 days'],
    ['2026-10-19', 'high', '7 days'],
    ['2026-10-20', 'moderate', '8 days'],
    ['2026-10-27', 'moderate', '15 days'],
    ['2026-10-28', 'low', '16 days'],
  ])('deadline %s is %s', (date, level, when) => {
    const u = deriveUrgency([mk('x', date)], '2026-10-12')
    expect(u.level).toBe(level)
    expect(u.reason).toContain(when)
  })

  it('is overdue when every dated deadline has passed', () => {
    const u = deriveUrgency([mk('x', '2026-10-01')], '2026-10-12')
    expect(u.level).toBe('overdue')
    expect(u.reason).toContain('11 days ago')
  })

  it('uses the next upcoming date and notes earlier ones that passed', () => {
    const u = deriveUrgency([mk('old', '2026-10-01'), mk('next', '2026-10-14')], '2026-10-12')
    expect(u.level).toBe('critical')
    expect(u.reason).toContain('1 earlier date already passed')
  })

  it('is unknown, and says so, when nothing can be dated', () => {
    const u = deriveUrgency([mk('x', null)], '2026-10-12')
    expect(u.level).toBe('unknown')
    expect(u.reason).toMatch(/ask a lawyer/i)
    expect(deriveUrgency([], '2026-10-12').level).toBe('unknown')
  })
})
