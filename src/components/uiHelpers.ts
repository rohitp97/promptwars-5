import type { Provenance } from '../types'

export type BadgeKind = 'verified' | 'approximate' | 'playbook' | 'notfound'

export function badgeKind(p: Provenance): BadgeKind {
  if (p.kind === 'playbook') return 'playbook'
  return p.status === 'verified' ? 'verified' : 'approximate'
}

export const buttonClass =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-brand/30 bg-white px-4 py-2 text-sm font-semibold text-brand hover:bg-brandSoft disabled:cursor-not-allowed disabled:opacity-50'

export const primaryButtonClass =
  'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-base font-semibold text-white hover:bg-[#17304f] disabled:cursor-not-allowed disabled:opacity-50'

/** Trigger a browser download of generated text. Object URLs are revoked right after the click. */
export function downloadText(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
