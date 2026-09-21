/**
 * Text normalisation for quote verification.
 *
 * The comparison keeps only letters, digits and combining marks (lower-cased, NFKC).
 * Whitespace, punctuation, quote styles, dashes, soft hyphens and zero-width joiners
 * all vanish, so a quote survives OCR spacing, line-break hyphenation and curly-vs-straight
 * quotes. Combining marks (\p{M}) are kept because Devanagari vowel signs live there.
 *
 * `map[i]` is the index in the ORIGINAL string that produced normalised char `i`, which is what
 * lets a match be highlighted in the source the user is actually reading.
 */
export interface NormalizedText {
  norm: string
  map: number[]
}

const KEEP = /[\p{L}\p{N}\p{M}]/u

export function normalizeWithMap(text: string): NormalizedText {
  let norm = ''
  const map: number[] = []
  let i = 0
  for (const ch of text) {
    // NFKC can expand one char to several (e.g. a "fi" ligature); every output char maps back to `i`.
    for (const out of ch.normalize('NFKC').toLowerCase()) {
      if (KEEP.test(out)) {
        norm += out
        // A code point may be 2 UTF-16 units; norm/map are indexed by UTF-16 unit of `norm`.
        for (let k = 0; k < out.length; k++) map.push(i)
      }
    }
    i += ch.length
  }
  return { norm, map }
}

export function normalizeOnly(text: string): string {
  return normalizeWithMap(text).norm
}
