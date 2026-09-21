export interface HighlightRange {
  id: string
  start: number
  end: number
}

export interface Segment {
  text: string
  /** Ids of every range covering this segment (a sentence can be cited by several claims). */
  ids: string[]
  active: boolean
}

/**
 * Split `text` at every range boundary so it can be rendered as plain React text nodes with <mark>
 * around cited spans, so notice text is never parsed as HTML. Out-of-bounds and empty ranges are ignored.
 */
export function segmentText(text: string, ranges: readonly HighlightRange[], activeId: string | null): Segment[] {
  const valid = ranges
    .filter(
      (r) =>
        Number.isInteger(r.start) &&
        Number.isInteger(r.end) &&
        r.start >= 0 &&
        r.end > r.start &&
        r.start < text.length,
    )
    .map((r) => ({ ...r, end: Math.min(r.end, text.length) }))
  if (valid.length === 0) return text.length === 0 ? [] : [{ text, ids: [], active: false }]

  const cuts = new Set<number>([0, text.length])
  for (const r of valid) {
    cuts.add(r.start)
    cuts.add(r.end)
  }
  const points = [...cuts].sort((a, b) => a - b)

  const segments: Segment[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]
    const to = points[i + 1]
    const ids = valid.filter((r) => r.start <= from && r.end >= to).map((r) => r.id)
    segments.push({ text: text.slice(from, to), ids, active: activeId !== null && ids.includes(activeId) })
  }
  return segments
}
