import { Info, LoaderCircle, Scale, Trash } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AiProviderName } from '../types'
import { buttonClass } from './uiHelpers'

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-3 focus:text-white"
    >
      Skip to main content
    </a>
  )
}

const AI_LABEL: Record<AiProviderName, string> = {
  'firebase-ai-logic': 'AI: Gemini via Firebase',
  'gemini-api-key': 'AI: Gemini (API key)',
}

export function Header({ aiName, onClear }: { aiName: AiProviderName | null; onClear: () => void }) {
  return (
    <header className="no-print border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <Scale aria-hidden="true" className="text-brand" size={28} />
          <div>
            <h1 className="text-xl font-bold leading-tight text-brand">Cited</h1>
            <p className="text-xs text-muted">Every claim, with its source.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-medium text-muted">
            {aiName ? AI_LABEL[aiName] : 'AI off — rule-based mode'}
          </span>
          <button type="button" onClick={onClear} className={`${buttonClass} !min-h-[36px] !px-3 !py-1`}>
            <Trash aria-hidden="true" size={15} /> Clear everything
          </button>
        </div>
      </div>
    </header>
  )
}

export function Disclaimer() {
  return (
    <aside aria-label="Important" className="no-print border-b border-approx/30 bg-approxSoft">
      <p className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-2 text-sm text-ink">
        <Info aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-approx" />
        <span>
          <strong>Information, not legal advice.</strong> Cited helps you understand a notice and prepare for a lawyer;
          it can make mistakes and is not a substitute for one. Free legal aid is available from your State Legal
          Services Authority (NALSA helpline: 15100).
        </span>
      </p>
    </aside>
  )
}

export function Progress({ message }: { message: string }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Google's newest models are sometimes overloaded and take ~20 s just to say so; be honest about it.
  const slow = seconds >= 20
  return (
    <div role="status" aria-live="polite" className="mx-auto mt-16 max-w-md text-center">
      <LoaderCircle aria-hidden="true" size={40} className="mx-auto animate-spin text-brand" />
      <p className="mt-4 text-lg font-semibold text-brand">{message}</p>
      <p className="mt-1 text-sm text-muted">
        {slow
          ? 'Still working. The AI service is busy right now, so this can take a minute or two. Nothing has been lost and nothing is being saved.'
          : 'This usually takes 10–30 seconds. Nothing is being saved.'}
      </p>
    </div>
  )
}
