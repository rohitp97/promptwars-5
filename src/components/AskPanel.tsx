import { CircleQuestionMark, Info, LoaderCircle, Send, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { getStarterQuestions } from '../data/playbook'
import { MIN_QUESTION_CHARS } from '../lib/qa'
import { MAX_QUESTION_CHARS } from '../lib/prompts'
import type { AnswerStatus, NoticeType, VerifiedAnswer } from '../types'
import { FindingList } from './Findings'
import { Panel, ProvenanceBadge } from './ui'
import { buttonClass, primaryButtonClass } from './uiHelpers'

/** What the hook exposes for questions; passed to the results screen as one object. */
export interface QaController {
  answers: VerifiedAnswer[]
  asking: boolean
  error: string | null
  ask: (question: string) => void
  dismissError: () => void
}

interface Props {
  noticeType: NoticeType
  answers: VerifiedAnswer[]
  asking: boolean
  error: string | null
  onAsk: (question: string) => void
  onDismissError: () => void
  activeId: string | null
  onLocate: (id: string) => void
}

const STATUS: Record<AnswerStatus, { label: string; cls: string; Icon: typeof Info }> = {
  answered: { label: 'Answered from your notice', cls: 'text-verified', Icon: ShieldCheck },
  partly: { label: 'Partly answered', cls: 'text-approx', Icon: ShieldCheck },
  not_in_notice: { label: 'Not in your notice', cls: 'text-missing', Icon: CircleQuestionMark },
  off_topic: { label: 'Not about this notice', cls: 'text-missing', Icon: Info },
  unverified: { label: 'Could not verify an answer', cls: 'text-danger', Icon: ShieldAlert },
}

function AnswerCard({ answer, activeId, onLocate }: { answer: VerifiedAnswer } & Pick<Props, 'activeId' | 'onLocate'>) {
  const { label, cls, Icon } = STATUS[answer.status]
  return (
    <li className="rounded-xl border border-line bg-paper p-3 sm:p-4">
      <h4 className="text-base font-semibold text-ink">{answer.question}</h4>
      <p className={`mt-1 flex items-center gap-1.5 text-sm font-semibold ${cls}`}>
        <Icon aria-hidden="true" size={16} /> {label}
      </p>

      {answer.source === 'fallback' && (
        <p role="note" className="mt-2 rounded-lg border border-approx/40 bg-approxSoft p-2 text-sm">
          <strong>Keyword search, not an AI answer.</strong> {answer.fallbackReason} It shows passages that use your
          words but does not interpret them.
        </p>
      )}

      {answer.status === 'off_topic' && (
        <p className="mt-2 text-sm text-muted">
          Cited can only answer questions about this notice. Try asking what it says, what it wants from you, or what
          happens next.
        </p>
      )}

      {answer.statements.length > 0 && (
        <div className="mt-3">
          <FindingList items={answer.statements} activeId={activeId} onLocate={onLocate} />
        </div>
      )}

      {answer.notInNotice && (
        <div className="mt-3 rounded-lg border border-line bg-white p-3">
          <ProvenanceBadge kind="notfound" />
          <p className="mt-2 text-base">{answer.notInNotice}</p>
        </div>
      )}

      {answer.lawyerQuestion && (
        <p className="mt-3 text-sm">
          <strong>Worth asking a lawyer:</strong> {answer.lawyerQuestion}
        </p>
      )}

      {answer.removed.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-brand">
            {answer.removed.length} statement{answer.removed.length === 1 ? '' : 's'} removed because they could not be
            verified
          </summary>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {answer.removed.map((r, i) => (
              <li key={i}>
                {r.text} <span className="text-muted">— {r.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}

/** A question box that answers only from the notice: every statement is verified, and "not in your notice" is a valid answer. */
export function AskPanel({ noticeType, answers, asking, error, onAsk, onDismissError, activeId, onLocate }: Props) {
  const [text, setText] = useState('')
  const inputId = useId()
  const canAsk = !asking && text.trim().length >= MIN_QUESTION_CHARS

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canAsk) return
    onAsk(text)
    setText('')
  }

  const latest = answers[0]
  const announcement = asking
    ? 'Checking your notice for an answer.'
    : latest
      ? `Answer ${answers.length} ready: ${STATUS[latest.status].label}.`
      : ''

  return (
    <Panel
      id="ask"
      title="Ask about this notice"
      hint="Answers come only from your notice, with the exact words shown. If it isn't in your notice, you'll be told."
    >
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor={inputId} className="block text-sm font-semibold">
            Your question
          </label>
          <input
            id={inputId}
            type="text"
            value={text}
            maxLength={MAX_QUESTION_CHARS}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. By when do I have to pay? (English or हिन्दी)"
            className="mt-1 min-h-[44px] w-full rounded-lg border border-line bg-white px-3"
            autoComplete="off"
          />
        </div>
        <button type="submit" disabled={!canAsk} className={primaryButtonClass}>
          {asking ? (
            <>
              <LoaderCircle aria-hidden="true" size={18} className="animate-spin" /> Checking…
            </>
          ) : (
            <>
              <Send aria-hidden="true" size={18} /> Ask
            </>
          )}
        </button>
      </form>

      <div className="mt-3">
        <p className="text-sm text-muted">Or try one of these:</p>
        <ul className="mt-1 flex flex-wrap gap-2">
          {getStarterQuestions(noticeType).map((q) => (
            <li key={q}>
              <button
                type="button"
                className={`${buttonClass} !min-h-[36px] !px-3 !py-1`}
                disabled={asking}
                onClick={() => onAsk(q)}
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-danger/40 bg-dangerSoft p-3 text-sm text-danger"
        >
          <p>{error}</p>
          <button type="button" onClick={onDismissError} className="font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {answers.length > 0 && (
        <ul className="mt-4 space-y-4" aria-busy={asking}>
          {answers.map((a) => (
            <AnswerCard key={a.id} answer={a} activeId={activeId} onLocate={onLocate} />
          ))}
        </ul>
      )}
    </Panel>
  )
}
