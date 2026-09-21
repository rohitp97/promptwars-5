import { DOCUMENT_ONLY_SECTIONS } from '../types'
import type {
  AnalysisResponse,
  FindingSection,
  Provenance,
  QuoteMatch,
  RawFinding,
  RemovedFinding,
  VerifiedFinding,
} from '../types'
import { normalizeOnly, normalizeWithMap } from './normalize'

/** Quotes shorter than this (after normalisation) match almost anything, so they prove nothing. */
export const MIN_QUOTE_CHARS = 10
/** Share of the quote's 4-grams that must appear close together for an "approximate" match. */
export const APPROX_THRESHOLD = 0.85
const GRAM = 4
/** Cap on positions kept per 4-gram so a very common gram can't blow up the window scan. */
const MAX_POSITIONS_PER_GRAM = 64

export interface PreparedSource {
  original: string
  norm: string
  map: number[]
  grams: Map<string, number[]> | null
}

/** Normalise the notice once; every quote is then checked against the same prepared text. */
export function prepareSource(original: string): PreparedSource {
  const { norm, map } = normalizeWithMap(original)
  return { original, norm, map, grams: null }
}

function gramIndex(src: PreparedSource): Map<string, number[]> {
  if (src.grams) return src.grams
  const index = new Map<string, number[]>()
  for (let i = 0; i + GRAM <= src.norm.length; i++) {
    const g = src.norm.slice(i, i + GRAM)
    const list = index.get(g)
    if (!list) index.set(g, [i])
    else if (list.length < MAX_POSITIONS_PER_GRAM) list.push(i)
  }
  src.grams = index
  return index
}

function endOffset(src: PreparedSource, normIndex: number): number {
  const at = src.map[normIndex]
  const cp = src.original.codePointAt(at)
  return at + (cp !== undefined && cp > 0xffff ? 2 : 1)
}

const unverified = (reason: string): QuoteMatch => ({ status: 'unverified', start: -1, end: -1, score: 0, reason })

/**
 * Locate `quote` inside the notice.
 * - exact: the normalised quote is a substring of the normalised source (score 1)
 * - approximate: ≥ 85% of the quote's 4-grams occur within a window ~1.3x the quote length
 * - unverified: anything else (including quotes too short to be meaningful)
 */
export function verifyQuote(quote: string, src: PreparedSource): QuoteMatch {
  const nq = normalizeOnly(quote)
  if (nq.length === 0) return unverified('empty_quote')
  if (nq.length < MIN_QUOTE_CHARS) return unverified('quote_too_short')
  if (src.norm.length === 0) return unverified('empty_source')

  const at = src.norm.indexOf(nq)
  if (at >= 0) {
    return { status: 'verified', start: src.map[at], end: endOffset(src, at + nq.length - 1), score: 1 }
  }
  return approximateMatch(nq, src)
}

function approximateMatch(nq: string, src: PreparedSource): QuoteMatch {
  const index = gramIndex(src)
  const quoteGrams = new Set<string>()
  for (let i = 0; i + GRAM <= nq.length; i++) quoteGrams.add(nq.slice(i, i + GRAM))
  if (quoteGrams.size === 0) return unverified('not_found')

  const hits: { pos: number; gram: string }[] = []
  for (const gram of quoteGrams) {
    const positions = index.get(gram)
    if (positions) for (const pos of positions) hits.push({ pos, gram })
  }
  if (hits.length === 0) return unverified('not_found')
  hits.sort((a, b) => a.pos - b.pos)

  const width = Math.ceil(nq.length * 1.3) + GRAM
  const counts = new Map<string, number>()
  let distinct = 0
  let left = 0
  let bestDistinct = 0
  let bestFirst = -1
  let bestLast = -1

  for (let right = 0; right < hits.length; right++) {
    const added = hits[right]
    const c = counts.get(added.gram) ?? 0
    if (c === 0) distinct++
    counts.set(added.gram, c + 1)

    while (hits[right].pos - hits[left].pos + GRAM > width) {
      const removed = hits[left]
      const rc = (counts.get(removed.gram) ?? 1) - 1
      counts.set(removed.gram, rc)
      if (rc === 0) distinct--
      left++
    }
    if (distinct > bestDistinct) {
      bestDistinct = distinct
      bestFirst = hits[left].pos
      bestLast = hits[right].pos
    }
  }

  const score = bestDistinct / quoteGrams.size
  if (score < APPROX_THRESHOLD) return { ...unverified('not_found'), score }
  return {
    status: 'approximate',
    start: src.map[bestFirst],
    end: endOffset(src, bestLast + GRAM - 1),
    score,
  }
}

// ── Findings ──────────────────────────────────────────────────────────────────

/** playbook item id → human label. Only refs in this map count as real playbook references. */
export type RefIndex = ReadonlyMap<string, string>

export type FindingCheck = { ok: true; provenance: Provenance } | { ok: false; reason: string }

/**
 * A finding is trusted only if:
 *  - it carries a quote that is found in the notice, or
 *  - (options / doNow only) it points at a real playbook item and carries no failed quote.
 * A quote that fails verification rejects the finding outright — a valid playbook ref can't rescue
 * a claim about the notice that the notice doesn't support.
 */
export function verifyFinding(
  section: FindingSection,
  finding: RawFinding,
  src: PreparedSource,
  refs: RefIndex,
): FindingCheck {
  if (finding.quote !== null && finding.quote.trim() !== '') {
    const match = verifyQuote(finding.quote, src)
    if (match.status === 'unverified') {
      return { ok: false, reason: quoteFailureMessage(match.reason) }
    }
    return {
      ok: true,
      provenance: {
        kind: 'document',
        status: match.status,
        quote: src.original.slice(match.start, match.end),
        start: match.start,
        end: match.end,
      },
    }
  }

  if (DOCUMENT_ONLY_SECTIONS.includes(section)) {
    return { ok: false, reason: 'Describes the notice but gave no quote from it' }
  }
  if (finding.playbookRef === null) {
    return { ok: false, reason: 'No source: neither a quote nor a playbook reference' }
  }
  const label = refs.get(finding.playbookRef)
  if (label === undefined) {
    return { ok: false, reason: 'Referenced guidance that is not in the built-in playbook' }
  }
  return { ok: true, provenance: { kind: 'playbook', ref: finding.playbookRef, refLabel: label } }
}

function quoteFailureMessage(reason: string | undefined): string {
  switch (reason) {
    case 'quote_too_short':
      return 'Quote too short to prove anything'
    case 'empty_quote':
      return 'Empty quote'
    default:
      return 'Quote not found in the notice'
  }
}

export interface VerifiedFindings {
  findings: Record<FindingSection, VerifiedFinding[]>
  removed: RemovedFinding[]
}

export const FINDING_SECTIONS: readonly FindingSection[] = [
  'whatItIs',
  'demands',
  'senderClaims',
  'consequences',
  'options',
  'doNow',
]

export function emptyFindings(): Record<FindingSection, VerifiedFinding[]> {
  return { whatItIs: [], demands: [], senderClaims: [], consequences: [], options: [], doNow: [] }
}

export function verifyFindings(
  response: Pick<AnalysisResponse, FindingSection>,
  src: PreparedSource,
  refs: RefIndex,
): VerifiedFindings {
  const findings = emptyFindings()
  const removed: RemovedFinding[] = []

  for (const section of FINDING_SECTIONS) {
    response[section].forEach((raw, index) => {
      const check = verifyFinding(section, raw, src, refs)
      if (check.ok) {
        findings[section].push({
          id: `${section}-${index}`,
          section,
          text: raw.text,
          why: raw.why,
          provenance: check.provenance,
        })
      } else {
        removed.push({ section, text: raw.text, reason: check.reason })
      }
    })
  }
  return { findings, removed }
}
