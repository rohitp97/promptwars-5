import { BookOpen, CircleQuestionMark, ScanSearch, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import type { BadgeKind } from './uiHelpers'

const BADGES: Record<BadgeKind, { label: string; cls: string; Icon: typeof ShieldCheck }> = {
  verified: { label: 'Verified quote', cls: 'bg-verifiedSoft text-verified border-verified/30', Icon: ShieldCheck },
  approximate: { label: 'Approximate match', cls: 'bg-approxSoft text-approx border-approx/30', Icon: ScanSearch },
  playbook: { label: 'General information', cls: 'bg-playbookSoft text-playbook border-playbook/30', Icon: BookOpen },
  notfound: { label: 'Not in your notice', cls: 'bg-missingSoft text-missing border-missing/30', Icon: CircleQuestionMark },
}

/** Every status has an icon AND a text label — colour is never the only signal. */
export function ProvenanceBadge({ kind }: { kind: BadgeKind }) {
  const { label, cls, Icon } = BADGES[kind]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      <Icon aria-hidden="true" size={13} />
      {label}
    </span>
  )
}

export function Panel({ id, title, hint, actions, children }: {
  id: string
  title: string
  hint?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-xl border border-line bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={`${id}-title`} className="text-lg font-semibold text-brand">
            {title}
          </h3>
          {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}
