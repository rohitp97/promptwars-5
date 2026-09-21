// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { GENERAL_GUIDANCE, NOTICE_TYPE_IDS, PLAYBOOK, buildRefIndex, getPlaybookEntry, isNoticeTypeId } from '../data/playbook'
import { buildSamples } from '../data/samples'
import { assembleResult } from '../lib/analysis'
import { buildFallbackResponse } from '../lib/fallback'
import { buildAnalysisPrompt } from '../lib/prompts'
import { detectNoticeType } from '../lib/retrieval'
import type { AnalysisResponse } from '../types'

const allItems = (e: (typeof PLAYBOOK)[number]) => [
  ...e.options.map((i) => i.id),
  ...e.pitfalls.map((i) => i.id),
  ...e.documents.map((i) => i.id),
  ...e.timelines.map((t) => t.id),
]

describe('playbook integrity (the trust layer depends on these ids)', () => {
  it('has unique ids across the whole playbook and general guidance', () => {
    const ids = [...PLAYBOOK.flatMap(allItems), ...GENERAL_GUIDANCE.map((g) => g.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('namespaces every item id by its entry id, and general items by "general."', () => {
    for (const e of PLAYBOOK) for (const id of allItems(e)) expect(id.startsWith(`${e.id}.`), id).toBe(true)
    for (const g of GENERAL_GUIDANCE) expect(g.id.startsWith('general.'), g.id).toBe(true)
  })

  it('gives every entry the fields the UI and prompt rely on', () => {
    for (const e of PLAYBOOK) {
      expect(e.title.length, e.id).toBeGreaterThan(3)
      expect(e.authority.length, e.id).toBeGreaterThan(0)
      expect(e.signals.length, e.id).toBeGreaterThan(2)
      expect(e.options.length, e.id).toBeGreaterThan(0)
      expect(e.documents.length, e.id).toBeGreaterThan(0)
      expect(e.lawyerQuestions.length, e.id).toBeGreaterThanOrEqual(3)
      expect(e.timelines.length, e.id).toBeGreaterThan(0)
      for (const item of [...e.options, ...e.pitfalls, ...e.documents]) {
        expect(item.label.length, item.id).toBeGreaterThan(2)
        expect(item.text.length, item.id).toBeGreaterThan(10)
      }
    }
  })

  it('has well-formed timelines: computable ones have offsets, event ones do not need them', () => {
    for (const e of PLAYBOOK) {
      e.timelines.forEach((t, i) => {
        expect(t.statuteRef.length, t.id).toBeGreaterThan(2)
        if (t.anchor === 'event') return
        expect(t.offset && (t.offset.days || t.offset.months), t.id).toBeTruthy()
        // "previous" must have something to follow.
        if (t.anchor === 'previous') expect(i, t.id).toBeGreaterThan(0)
      })
    }
  })

  it('has positive signal weights and no duplicate signal terms within an entry', () => {
    for (const e of PLAYBOOK) {
      const terms = e.signals.map((s) => s.term.toLowerCase())
      expect(new Set(terms).size, e.id).toBe(terms.length)
      for (const s of e.signals) expect(s.weight, `${e.id}:${s.term}`).toBeGreaterThan(0)
    }
  })

  it('exposes consistent lookups', () => {
    expect(NOTICE_TYPE_IDS).toEqual(PLAYBOOK.map((e) => e.id))
    expect(isNoticeTypeId('cheque_bounce')).toBe(true)
    expect(isNoticeTypeId('other')).toBe(false)
    expect(isNoticeTypeId('__proto__')).toBe(false)
    expect(getPlaybookEntry('other')).toBeNull()
    expect(getPlaybookEntry('loan_recovery')?.id).toBe('loan_recovery')
  })
})

describe('general guidance', () => {
  it('is referenceable for every notice type, including "other"', () => {
    const other = buildRefIndex(null)
    for (const g of GENERAL_GUIDANCE) expect(other.has(g.id), g.id).toBe(true)
    for (const e of PLAYBOOK) {
      const idx = buildRefIndex(e)
      for (const g of GENERAL_GUIDANCE) expect(idx.has(g.id)).toBe(true)
    }
  })

  it('never leaks type-specific ids across types', () => {
    const idx = buildRefIndex(getPlaybookEntry('eviction_rent'))
    expect(idx.has('eviction_rent.opt.reply')).toBe(true)
    expect(idx.has('cheque_bounce.opt.pay')).toBe(false)
    expect(buildRefIndex(null).has('eviction_rent.opt.reply')).toBe(false)
  })

  it('labels general items distinctly from type playbooks', () => {
    expect(buildRefIndex(null).get('general.do.lawyer')).toMatch(/^General guidance · /)
  })

  it('is offered to the model in the prompt, with the rule that "other" may use it', () => {
    const { prompt, systemInstruction } = buildAnalysisPrompt({ sourceText: 'x'.repeat(30), receivedOn: '2026-10-10', language: 'auto', hint: detectNoticeType('') })
    for (const g of GENERAL_GUIDANCE) expect(prompt).toContain(g.id)
    expect(systemInstruction).toMatch(/"general"/)
  })

  it('points to free legal aid without inventing a statute', () => {
    const lawyer = GENERAL_GUIDANCE.find((g) => g.id === 'general.do.lawyer')!
    expect(lawyer.text).toMatch(/free legal aid/i)
    expect(lawyer.text).not.toMatch(/section|act,?\s+\d{4}/i)
  })
})

describe('"other" notices still get sourced next steps', () => {
  const samples = buildSamples('2026-10-12')
  const other = samples.find((s) => s.id === 'other')!.text
  const blank = (over: Partial<AnalysisResponse>): AnalysisResponse => ({
    noticeType: 'other', documentLanguage: 'English', noticeDate: null, noticeDateQuote: null,
    whatItIs: [], demands: [], senderClaims: [], consequences: [], options: [], doNow: [],
    deadlines: [], notStated: [], lawyerQuestions: [], ...over,
  })
  const run = (response: AnalysisResponse, text = other) =>
    assembleResult({ response, malformed: 0, sourceText: text, receivedOn: '2026-10-10', today: '2026-10-12', source: 'gemini', fallbackReason: null })

  it('accepts do-now steps that cite general guidance', () => {
    const r = run(blank({ doNow: [{ text: 'Keep everything.', why: null, quote: null, playbookRef: 'general.do.keep' }] }))
    expect(r.findings.doNow).toHaveLength(1)
    expect(r.findings.doNow[0].provenance).toMatchObject({ kind: 'playbook', refLabel: expect.stringContaining('General guidance') })
    expect(r.removed).toEqual([])
  })

  it('still rejects unsourced advice and type-specific ids on an "other" notice', () => {
    const r = run(blank({
      doNow: [
        { text: 'Consult an IP lawyer.', why: null, quote: null, playbookRef: null },
        { text: 'Pay now.', why: null, quote: null, playbookRef: 'cheque_bounce.opt.pay' },
      ],
    }))
    expect(r.findings.doNow).toHaveLength(0)
    expect(r.removed).toHaveLength(2)
  })

  it('still gives no options for "other", even if the model cites a general id there', () => {
    // options may rest on any valid ref, but the prompt tells the model to leave them empty; the
    // curated-type options can never appear.
    const r = run(blank({ options: [{ text: 'Sue.', why: null, quote: null, playbookRef: 'cheque_bounce.opt.pay' }] }))
    expect(r.findings.options).toHaveLength(0)
  })

  it('the rule-based fallback offers the general steps, all verified, when no type matches', () => {
    const r = run(buildFallbackResponse(other))
    expect(r.noticeType).toBe('other')
    expect(r.findings.doNow.length).toBeGreaterThanOrEqual(3)
    expect(r.findings.doNow.every((f) => f.provenance.kind === 'playbook' || f.provenance.kind === 'document')).toBe(true)
    expect(r.findings.options).toHaveLength(0)
    expect(r.removed).toEqual([])
  })

  it('a typed notice does NOT get the general steps injected in fallback (its own steps are better)', () => {
    const cheque = samples.find((s) => s.id === 'cheque')!.text
    const r = run(buildFallbackResponse(cheque), cheque)
    expect(r.findings.doNow.some((f) => f.provenance.kind === 'playbook' && f.provenance.ref.startsWith('general.'))).toBe(false)
  })
})
