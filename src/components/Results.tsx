import { Clock, Copy, Download, Printer, RotateCcw, TriangleAlert, CircleQuestionMark, Info } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getPlaybookEntry } from '../data/playbook'
import { buildBriefMarkdown } from '../lib/brief'
import { formatLong } from '../lib/dates'
import { buildIcs } from '../lib/ics'
import type { HighlightRange } from '../lib/segments'
import type { AnalysisResult, FindingSection, UrgencyLevel } from '../types'
import { CalendarButton, Checklist, DeadlineList, FindingList } from './Findings'
import { MarkdownLite } from './MarkdownLite'
import { SourceViewer } from './SourceViewer'
import { Panel, ProvenanceBadge } from './ui'
import { buttonClass, downloadText } from './uiHelpers'

const URGENCY: Record<UrgencyLevel, { label: string; cls: string; Icon: typeof Clock }> = {
  critical: { label: 'Act now', cls: 'border-danger bg-dangerSoft text-danger', Icon: TriangleAlert },
  high: { label: 'Urgent', cls: 'border-danger bg-dangerSoft text-danger', Icon: TriangleAlert },
  moderate: { label: 'Coming up soon', cls: 'border-approx bg-approxSoft text-approx', Icon: Clock },
  low: { label: 'You have time', cls: 'border-verified bg-verifiedSoft text-verified', Icon: Clock },
  overdue: { label: 'A date has passed', cls: 'border-danger bg-dangerSoft text-danger', Icon: TriangleAlert },
  unknown: { label: 'No deadline found', cls: 'border-missing bg-missingSoft text-missing', Icon: CircleQuestionMark },
}

const FINDING_SECTIONS: readonly FindingSection[] = ['whatItIs', 'demands', 'senderClaims', 'consequences', 'options', 'doNow']

function collectRanges(result: AnalysisResult): HighlightRange[] {
  const ranges: HighlightRange[] = []
  for (const section of FINDING_SECTIONS) {
    for (const f of result.findings[section]) {
      if (f.provenance.kind === 'document') ranges.push({ id: f.id, start: f.provenance.start, end: f.provenance.end })
    }
  }
  for (const d of result.deadlines) {
    if (d.provenance.kind === 'document') ranges.push({ id: d.id, start: d.provenance.start, end: d.provenance.end })
  }
  return ranges
}

interface Props {
  result: AnalysisResult
  onStartOver: () => void
}

export function Results({ result, onStartOver }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle')
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const ranges = useMemo(() => collectRanges(result), [result])
  const brief = useMemo(() => buildBriefMarkdown(result), [result])
  const ics = useMemo(() => buildIcs(result), [result])
  const entry = getPlaybookEntry(result.noticeType)
  const u = URGENCY[result.urgency.level]
  const s = result.summary
  const f = result.findings

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(brief)
      setCopied('ok')
    } catch {
      setCopied('failed')
    }
  }

  return (
    <>
      <div className="no-print">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 ref={headingRef} tabIndex={-1} id="results-title" className="text-2xl font-bold text-brand outline-none">
              {entry ? entry.title : 'Your notice'}
            </h2>
            <p className="text-sm text-muted">
              Received {formatLong(result.receivedOn)} · read as {result.documentLanguage}
              {result.source === 'gemini' ? ' · analysed by Gemini, checked by Cited' : ' · rule-based reading'}
            </p>
          </div>
          <button type="button" className={buttonClass} onClick={onStartOver}>
            <RotateCcw aria-hidden="true" size={16} /> Start over
          </button>
        </div>

        <div role="status" className={`mt-4 flex items-start gap-3 rounded-xl border-2 p-4 ${u.cls}`}>
          <u.Icon aria-hidden="true" size={28} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-xl font-bold">{u.label}</p>
            <p className="mt-0.5 text-base text-ink">{result.urgency.reason}</p>
          </div>
        </div>

        {result.source === 'fallback' && (
          <p role="note" className="mt-3 flex items-start gap-2 rounded-lg border border-approx/40 bg-approxSoft p-3 text-sm">
            <Info aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-approx" />
            <span>
              <strong>Rule-based reading.</strong> {result.fallbackReason} This is simpler than the AI reading and may miss things, but
              everything shown still comes from your notice&rsquo;s own words.
            </span>
          </p>
        )}

        {result.noticeType === 'other' && (
          <p role="note" className="mt-3 flex items-start gap-2 rounded-lg border border-missing/40 bg-missingSoft p-3 text-sm">
            <CircleQuestionMark aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-missing" />
            <span>
              <strong>No curated guidance for this kind of notice.</strong> Cited only has vetted guidance for a few common notice types, and won&rsquo;t
              improvise. You&rsquo;ll see what the notice says and what it leaves out, but no suggested options.
            </span>
          </p>
        )}

        <details className="mt-3 rounded-xl border border-line bg-card p-3">
          <summary className="cursor-pointer text-sm font-semibold text-brand">
            <span className="mr-2">{s.checked} statements checked:</span>
            <span className="mr-2">{s.verified} verified</span>
            <span className="mr-2">· {s.approximate} approximate</span>
            <span className="mr-2">· {s.playbook} general info</span>
            <span>· {s.removed} removed</span>
          </summary>
          <div className="mt-3 space-y-3 text-sm">
            <p>Before anything is shown, Cited checks every quote against the exact text of your notice. Labels you&rsquo;ll see:</p>
            <ul className="space-y-1">
              <li><ProvenanceBadge kind="verified" /> the quote was found word-for-word in your notice.</li>
              <li><ProvenanceBadge kind="approximate" /> found with small differences (a scan or typing glitch). Read the quote yourself.</li>
              <li><ProvenanceBadge kind="playbook" /> guidance from Cited&rsquo;s vetted notes, not from your notice.</li>
              <li><ProvenanceBadge kind="notfound" /> something a notice normally says that yours doesn&rsquo;t.</li>
            </ul>
            <p className="text-muted">
              A found quote proves those words are in your notice; it doesn&rsquo;t prove the plain-language summary next to it is perfect.
              That&rsquo;s why the quote always sits right beside it.
            </p>
            {result.removed.length > 0 && (
              <div>
                <p className="font-semibold">Removed because they couldn&rsquo;t be verified ({result.removed.length}):</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {result.removed.map((r, i) => (
                    <li key={i}>
                      {r.text} <span className="text-muted">— {r.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="space-y-6">
            <Panel
              id="deadlines"
              title="Dates that matter"
              hint="Worked out by the app from the wording in your notice and the date you received it."
              actions={<CalendarButton disabled={ics === null} onClick={() => ics && downloadText('notice-deadlines.ics', ics, 'text/calendar')} />}
            >
              {result.deadlines.length > 0 ? (
                <DeadlineList result={result} activeId={activeId} onLocate={setActiveId} />
              ) : (
                <p className="flex items-start gap-2 text-sm">
                  <ProvenanceBadge kind="notfound" /> No deadline was found in this notice.
                </p>
              )}
            </Panel>

            {f.whatItIs.length > 0 && (
              <Panel id="what" title="What this is">
                <FindingList items={f.whatItIs} activeId={activeId} onLocate={setActiveId} />
              </Panel>
            )}
            {f.demands.length > 0 && (
              <Panel id="demands" title="What they want from you">
                <FindingList items={f.demands} activeId={activeId} onLocate={setActiveId} />
              </Panel>
            )}
            {f.doNow.length > 0 && (
              <Panel id="donow" title="Do this now" hint="Steps for the next 48 hours.">
                <Checklist items={f.doNow} activeId={activeId} onLocate={setActiveId} />
              </Panel>
            )}
            {f.options.length > 0 && (
              <Panel id="options" title="Your options" hint="General information about choices people in this situation have. Not a recommendation.">
                <FindingList items={f.options} activeId={activeId} onLocate={setActiveId} />
              </Panel>
            )}
            {f.consequences.length > 0 && (
              <Panel id="consequences" title="What they say will happen if you do nothing">
                <FindingList items={f.consequences} activeId={activeId} onLocate={setActiveId} />
              </Panel>
            )}
            {f.senderClaims.length > 0 && (
              <Panel id="claims" title="What they claim" hint="These are their statements. They are not proven.">
                <FindingList items={f.senderClaims} activeId={activeId} onLocate={setActiveId} />
              </Panel>
            )}

            {result.notStated.length > 0 && (
              <Panel id="notstated" title="What the notice doesn't say" hint="Gaps worth knowing about. Cited will not guess them.">
                <ul className="space-y-3">
                  {result.notStated.map((n, i) => (
                    <li key={i} className="rounded-lg border border-line bg-white p-3">
                      <ProvenanceBadge kind="notfound" />
                      <p className="mt-2 text-base font-medium">{n.question}</p>
                      <p className="mt-1 text-sm text-muted">{n.whyItMatters}</p>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            <Panel
              id="brief"
              title="Brief for your lawyer"
              hint="Facts, dates, quotes and questions on one page, so a first meeting isn't spent explaining the basics."
              actions={
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={buttonClass} onClick={copyBrief}>
                    <Copy aria-hidden="true" size={16} /> Copy
                  </button>
                  <button type="button" className={buttonClass} onClick={() => downloadText('lawyer-brief.md', brief, 'text/markdown')}>
                    <Download aria-hidden="true" size={16} /> Download
                  </button>
                  <button type="button" className={buttonClass} onClick={() => window.print()}>
                    <Printer aria-hidden="true" size={16} /> Print / PDF
                  </button>
                </div>
              }
            >
              <p role="status" className="mb-2 text-sm text-verified">
                {copied === 'ok' ? 'Copied to clipboard.' : ''}
                {copied === 'failed' ? 'Could not copy. Use Download instead.' : ''}
              </p>
              <div className="max-h-96 overflow-auto rounded-lg border border-line bg-white p-3">
                <MarkdownLite text={brief} baseLevel={4} />
              </div>
            </Panel>
          </div>

          <aside className="lg:sticky lg:top-4 lg:self-start" aria-label="Source text">
            <SourceViewer text={result.sourceText} ranges={ranges} activeId={activeId} language={result.documentLanguage} />
          </aside>
        </div>
      </div>

      {/* Only this is printed: the brief, as clean text, with the standing disclaimer. */}
      <div className="print-only">
        <MarkdownLite text={brief} />
      </div>
    </>
  )
}
