// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { normalizeOnly, normalizeWithMap } from '../lib/normalize'
import { emptyFindings, prepareSource, verifyFinding, verifyFindings, verifyQuote } from '../lib/verify'
import type { RawFinding } from '../types'

const NOTICE = `You are hereby called upon to pay the said sum of Rs. 1,50,000/- to my client within
15 days of receipt of this notice, failing which my client shall be constrained to initiate
criminal proceedings against you under Section 138.`

describe('normalizeWithMap', () => {
  it('drops whitespace, punctuation and case but keeps letters and digits', () => {
    expect(normalizeOnly('Rs. 1,50,000/-  Pay NOW!')).toBe('rs150000paynow')
  })

  it('maps every normalised char back to the original index', () => {
    const { norm, map } = normalizeWithMap('a - b')
    expect(norm).toBe('ab')
    expect(map).toEqual([0, 4])
  })

  it('keeps Devanagari letters and combining vowel signs', () => {
    expect(normalizeOnly('चेक संख्या')).toBe('चेकसंख्या')
  })

  it('handles empty and punctuation-only input', () => {
    expect(normalizeOnly('')).toBe('')
    expect(normalizeOnly('…!? — ')).toBe('')
  })

  it('normalises curly quotes, ligatures and zero-width characters', () => {
    expect(normalizeOnly('“Funds” ﬁnal​')).toBe('fundsfinal')
  })

  it('keeps map and norm the same length for astral characters', () => {
    const { norm, map } = normalizeWithMap('a😀b𝒜')
    expect(map.length).toBe(norm.length)
  })
})

describe('verifyQuote', () => {
  const src = prepareSource(NOTICE)

  it('finds an exact quote and returns offsets into the original text', () => {
    const q = 'within 15 days of receipt of this notice'
    const m = verifyQuote(q, src)
    expect(m.status).toBe('verified')
    expect(m.score).toBe(1)
    expect(NOTICE.slice(m.start, m.end)).toContain('15 days of receipt')
  })

  it('survives line breaks, extra spaces and different quote marks', () => {
    const m = verifyQuote('within\n\n 15    days   of   receipt', src)
    expect(m.status).toBe('verified')
  })

  it('is case-insensitive', () => {
    expect(verifyQuote('CRIMINAL PROCEEDINGS AGAINST YOU', src).status).toBe('verified')
  })

  it('survives hyphenation across a line break', () => {
    const s = prepareSource('The borrower is required to dis-\ncharge the liability in full.')
    expect(verifyQuote('required to discharge the liability', s).status).toBe('verified')
  })

  it('rejects a quote that is not in the notice', () => {
    const m = verifyQuote('you must vacate the premises immediately', src)
    expect(m.status).toBe('unverified')
    expect(m.start).toBe(-1)
  })

  it('rejects a paraphrase that reuses common words', () => {
    const m = verifyQuote('you will be prosecuted if the money is not paid within two weeks', src)
    expect(m.status).toBe('unverified')
  })

  it('rejects empty, punctuation-only and too-short quotes', () => {
    expect(verifyQuote('', src).reason).toBe('empty_quote')
    expect(verifyQuote('...!!', src).reason).toBe('empty_quote')
    expect(verifyQuote('Rs. 1,50', src).reason).toBe('quote_too_short')
  })

  it('reports empty_source when there is no notice text', () => {
    expect(verifyQuote('some reasonably long quote', prepareSource('')).reason).toBe('empty_source')
  })

  it('accepts a quote with a few OCR-style character errors as approximate', () => {
    const m = verifyQuote('failing which my c1ient shall be constralned to initiate criminal proceedings', src)
    expect(m.status).toBe('approximate')
    expect(m.score).toBeGreaterThanOrEqual(0.85)
    expect(NOTICE.slice(m.start, m.end)).toContain('constrained')
  })

  it('finds Devanagari quotes and highlights the right span', () => {
    const hi = 'उक्त चेक दिनांक 01/10/2026 को अपर्याप्त निधि के कारण अनादरित कर दिया गया।'
    const s = prepareSource(`नमूना\n${hi}\nअधिवक्ता`)
    const m = verifyQuote('अपर्याप्त निधि के कारण अनादरित', s)
    expect(m.status).toBe('verified')
    expect(s.original.slice(m.start, m.end).replace(/\s/g, '')).toBe('अपर्याप्तनिधिकेकारणअनादरित')
  })

  it('returns the first occurrence when a quote appears twice', () => {
    const s = prepareSource('pay the amount now. Later: pay the amount now.')
    const m = verifyQuote('pay the amount now', s)
    expect(m.start).toBe(0)
  })

  it('places the end offset after an astral character', () => {
    const s = prepareSource('Notice for 𝒜𝒷𝒸 payment due')
    const m = verifyQuote('Notice for 𝒜𝒷𝒸 payment', s)
    expect(m.status).toBe('verified')
    expect(s.original.slice(m.start, m.end)).toBe('Notice for 𝒜𝒷𝒸 payment')
  })

  it('handles a very long source without timing out', () => {
    const big = prepareSource(`${'lorem ipsum dolor sit amet '.repeat(2000)} the unique target sentence here`)
    const t = performance.now()
    expect(verifyQuote('the unique target sentence here', big).status).toBe('verified')
    expect(verifyQuote('something entirely different and absent from text', big).status).toBe('unverified')
    expect(performance.now() - t).toBeLessThan(500)
  })
})

describe('verifyFinding', () => {
  const src = prepareSource(NOTICE)
  const refs = new Map([['cheque_bounce.opt.pay', 'Cheque bounce playbook · Pay within the window']])
  const f = (over: Partial<RawFinding>): RawFinding => ({ text: 'x', why: null, quote: null, playbookRef: null, ...over })

  it('accepts a finding with a verified quote as DOCUMENT provenance', () => {
    const r = verifyFinding('demands', f({ quote: 'pay the said sum of Rs. 1,50,000' }), src, refs)
    expect(r.ok && r.provenance.kind === 'document' && r.provenance.status).toBe('verified')
  })

  it('rejects a finding whose quote is not in the notice', () => {
    const r = verifyFinding('demands', f({ quote: 'pay Rs. 9,99,999 immediately or else' }), src, refs)
    expect(r).toEqual({ ok: false, reason: 'Quote not found in the notice' })
  })

  it('does NOT let a valid playbook ref rescue a failed quote', () => {
    const r = verifyFinding('options', f({ quote: 'a sentence the notice never contains', playbookRef: 'cheque_bounce.opt.pay' }), src, refs)
    expect(r.ok).toBe(false)
  })

  it('accepts a playbook-only finding in options and doNow', () => {
    for (const section of ['options', 'doNow'] as const) {
      const r = verifyFinding(section, f({ playbookRef: 'cheque_bounce.opt.pay' }), src, refs)
      expect(r.ok && r.provenance.kind).toBe('playbook')
    }
  })

  it('rejects a playbook-only finding in a document-only section', () => {
    for (const section of ['whatItIs', 'demands', 'senderClaims', 'consequences'] as const) {
      expect(verifyFinding(section, f({ playbookRef: 'cheque_bounce.opt.pay' }), src, refs).ok).toBe(false)
    }
  })

  it('rejects an unknown playbook ref and a finding with no source at all', () => {
    expect(verifyFinding('options', f({ playbookRef: 'made.up.ref' }), src, refs).ok).toBe(false)
    expect(verifyFinding('options', f({}), src, refs).ok).toBe(false)
  })

  it('treats a whitespace-only quote as no quote', () => {
    expect(verifyFinding('demands', f({ quote: '   ' }), src, refs).ok).toBe(false)
  })
})

describe('verifyFindings', () => {
  it('sorts kept findings into sections and lists removed ones with reasons', () => {
    const src = prepareSource(NOTICE)
    const empty = emptyFindings()
    const good: RawFinding = { text: 'Pay the sum', why: null, quote: 'to pay the said sum of Rs. 1,50,000', playbookRef: null }
    const bad: RawFinding = { text: 'Invented', why: null, quote: 'this sentence was invented by a model', playbookRef: null }
    const { findings, removed } = verifyFindings({ ...emptyRaw(), demands: [good, bad] }, src, new Map())
    expect(findings.demands).toHaveLength(1)
    expect(findings.demands[0].id).toBe('demands-0')
    expect(removed).toEqual([{ section: 'demands', text: 'Invented', reason: 'Quote not found in the notice' }])
    expect(Object.keys(empty)).toHaveLength(6)
  })
})

function emptyRaw() {
  return { whatItIs: [], demands: [], senderClaims: [], consequences: [], options: [], doNow: [] } as Record<
    'whatItIs' | 'demands' | 'senderClaims' | 'consequences' | 'options' | 'doNow',
    RawFinding[]
  >
}
