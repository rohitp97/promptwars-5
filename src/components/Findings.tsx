import { CalendarPlus, Crosshair } from 'lucide-react'
import { useState } from 'react'
import { describeDaysLeft } from '../lib/brief'
import { diffDays, formatLong } from '../lib/dates'
import type { AnalysisResult, ResolvedDeadline, VerifiedFinding } from '../types'
import { ProvenanceBadge } from './ui'
import { badgeKind, buttonClass } from './uiHelpers'

interface LocateProps {
  activeId: string | null
  onLocate: (id: string) => void
}

function LocateButton({ id, activeId, onLocate }: LocateProps & { id: string }) {
  return (
    <button
      type="button"
      onClick={() => onLocate(id)}
      aria-pressed={activeId === id}
      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brandSoft aria-pressed:border-brand aria-pressed:bg-brandSoft"
    >
      <Crosshair aria-hidden="true" size={14} /> Show in notice
    </button>
  )
}

function FindingItem({ f, activeId, onLocate }: { f: VerifiedFinding } & LocateProps) {
  const p = f.provenance
  return (
    <li className="rounded-lg border border-line bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ProvenanceBadge kind={badgeKind(p)} />
        {p.kind === 'playbook' && <span className="text-xs text-muted">{p.refLabel}</span>}
      </div>
      <p className="mt-2 text-base font-medium">{f.text}</p>
      {f.why && <p className="mt-1 text-sm text-muted">Why it matters: {f.why}</p>}
      {p.kind === 'document' && (
        <>
          <blockquote className="mt-2 border-l-4 border-mark bg-paper py-1 pl-3 pr-2 font-serif text-sm">
            <span className="sr-only">In your notice: </span>
            {p.quote}
          </blockquote>
          <div className="mt-2">
            <LocateButton id={f.id} activeId={activeId} onLocate={onLocate} />
          </div>
        </>
      )}
    </li>
  )
}

export function FindingList({ items, activeId, onLocate }: { items: VerifiedFinding[] } & LocateProps) {
  return (
    <ul className="space-y-3">
      {items.map((f) => (
        <FindingItem key={f.id} f={f} activeId={activeId} onLocate={onLocate} />
      ))}
    </ul>
  )
}

/** "Do this now" as a checklist the person can tick off. State is local and never persisted. */
export function Checklist({ items, activeId, onLocate }: { items: VerifiedFinding[] } & LocateProps) {
  const [done, setDone] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <>
      <p className="mb-2 text-sm text-muted" aria-live="polite">
        {done.size} of {items.length} done
      </p>
      <ul className="space-y-3">
        {items.map((f) => (
          <li key={f.id} className="rounded-lg border border-line bg-white p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={done.has(f.id)}
                onChange={() => toggle(f.id)}
                className="mt-1 h-5 w-5 shrink-0 accent-[#1f3a5f]"
              />
              <span className={done.has(f.id) ? 'text-muted line-through' : ''}>
                <span className="block text-base font-medium">{f.text}</span>
              </span>
            </label>
            <div className="ml-8 mt-2 flex flex-wrap items-center gap-2">
              <ProvenanceBadge kind={badgeKind(f.provenance)} />
              {f.provenance.kind === 'playbook' && <span className="text-xs text-muted">{f.provenance.refLabel}</span>}
              {f.provenance.kind === 'document' && <LocateButton id={f.id} activeId={activeId} onLocate={onLocate} />}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

export function DeadlineList({ result, activeId, onLocate }: { result: AnalysisResult } & LocateProps) {
  return (
    <ol className="space-y-3">
      {result.deadlines.map((d) => (
        <DeadlineItem key={d.id} d={d} today={result.analysedOn} activeId={activeId} onLocate={onLocate} />
      ))}
    </ol>
  )
}

function DeadlineItem({ d, today, activeId, onLocate }: { d: ResolvedDeadline; today: string } & LocateProps) {
  const left = d.date ? diffDays(today, d.date) : null
  const past = left !== null && left < 0
  return (
    <li className="rounded-lg border border-line bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-base font-semibold">{d.label}</p>
        {d.date ? (
          <p className={`text-base font-bold ${past ? 'text-danger' : 'text-brand'}`}>
            {formatLong(d.date)} <span className="text-sm font-semibold">({describeDaysLeft(left as number)})</span>
          </p>
        ) : (
          <p className="text-sm font-semibold text-missing">Date can&rsquo;t be worked out</p>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ProvenanceBadge kind={badgeKind(d.provenance)} />
        <span className="text-xs text-muted">
          {d.origin === 'notice' ? 'Stated in your notice' : 'General rule for this type of notice'}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">{d.basis}</p>
      {d.provenance.kind === 'document' && (
        <>
          <blockquote className="mt-2 border-l-4 border-mark bg-paper py-1 pl-3 pr-2 font-serif text-sm">
            {d.provenance.quote}
          </blockquote>
          <div className="mt-2">
            <LocateButton id={d.id} activeId={activeId} onLocate={onLocate} />
          </div>
        </>
      )}
    </li>
  )
}

export function CalendarButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={buttonClass}
      disabled={disabled}
      onClick={onClick}
      title={disabled ? 'No upcoming dated deadlines to add' : undefined}
    >
      <CalendarPlus aria-hidden="true" size={16} /> Add dates to calendar
    </button>
  )
}
