import { useMemo } from 'react'
import { Disclaimer, Header, Progress, SkipLink } from './components/Chrome'
import { Intake } from './components/Intake'
import { Results } from './components/Results'
import { TranscriptReview } from './components/TranscriptReview'
import { buildSamples } from './data/samples'
import { useCase } from './hooks/useCase'
import type { Phase } from './hooks/useCase'

const LABELS: Record<string, string> = {
  critical: 'Act now',
  high: 'Urgent',
  moderate: 'Coming up soon',
  low: 'You have time',
  overdue: 'A date has passed',
  unknown: 'No deadline found',
}

/** Screen-reader announcement derived from the current phase (no effect, no extra render). */
function announce(phase: Phase): string {
  switch (phase.kind) {
    case 'reading':
      return 'Reading your file.'
    case 'analysing':
      return 'Reading your notice and checking every quote.'
    case 'result':
      return `Results ready. ${LABELS[phase.result.urgency.level]}. ${phase.result.summary.checked} statements checked.`
    default:
      return ''
  }
}

export default function App() {
  const c = useCase()
  const samples = useMemo(() => buildSamples(c.today), [c.today])
  const announcement = announce(c.phase)

  return (
    <>
      <SkipLink />
      <Header aiName={c.aiName} onClear={c.reset} />
      <Disclaimer />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-6 outline-none sm:py-8">
        <div className="sr-only" role="status" aria-live="polite">
          {announcement}
        </div>

        {c.phase.kind === 'intake' && (
          <Intake
            draft={c.draft}
            setDraft={c.setDraft}
            today={c.today}
            samples={samples}
            aiName={c.aiName}
            error={c.error}
            onDismissError={c.dismissError}
            onAnalyse={c.analyse}
            onFile={c.readFile}
          />
        )}

        {c.phase.kind === 'reading' && <Progress message={`Reading ${c.phase.fileName}…`} />}
        {c.phase.kind === 'analysing' && <Progress message="Reading your notice and checking every quote…" />}

        {c.phase.kind === 'review' && (
          <TranscriptReview
            fileName={c.phase.fileName}
            initialText={c.phase.text}
            previewUrl={c.phase.previewUrl}
            onConfirm={c.confirmTranscript}
            onBack={c.backToIntake}
          />
        )}

        {c.phase.kind === 'result' && <Results result={c.phase.result} onStartOver={c.reset} />}
      </main>
      <footer className="no-print mx-auto max-w-6xl px-4 pb-8 text-xs text-muted">
        Cited gives general information, tied to your notice&rsquo;s own words. Curated guidance covers a few common
        Indian notice types and was last reviewed 21 Sep 2026; laws and state rules change.
      </footer>
    </>
  )
}
