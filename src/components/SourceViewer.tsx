import { useEffect, useMemo, useRef } from 'react'
import { segmentText } from '../lib/segments'
import type { HighlightRange } from '../lib/segments'

interface Props {
  text: string
  /** Language name from the analysis (e.g. 'Hindi'); sets lang= on the text for screen readers. */
  language?: string
  ranges: HighlightRange[]
  activeId: string | null
}

/**
 * The notice exactly as analysed, with every cited passage highlighted and the active one
 * emphasised. Rendered as plain text nodes plus <mark>: no innerHTML.
 */
export function SourceViewer({ text, ranges, activeId, language }: Props) {
  const segments = useMemo(() => segmentText(text, ranges, activeId), [text, ranges, activeId])
  const activeRef = useRef<HTMLElement | null>(null)
  const firstActive = segments.findIndex((s) => s.active)

  useEffect(() => {
    if (activeId !== null) activeRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [activeId])

  return (
    <section aria-labelledby="source-title" className="rounded-xl border border-line bg-card p-4 shadow-sm">
      <h3 id="source-title" className="text-lg font-semibold text-brand">
        Your notice, as analysed
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        <mark>Highlighted</mark> passages are the ones the results quote. Choose &ldquo;Show in notice&rdquo; on any point to jump here.
      </p>
      <div
        id="notice-text"
        tabIndex={0}
        aria-label="Full text of your notice"
        lang={language === 'Hindi' ? 'hi' : undefined}
        className="mt-3 max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-white p-3 font-serif text-[15px] leading-relaxed"
      >
        {segments.map((s, i) =>
          s.ids.length > 0 ? (
            <mark key={i} data-active={s.active} ref={i === firstActive ? activeRef : undefined}>
              {s.text}
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </div>
    </section>
  )
}
