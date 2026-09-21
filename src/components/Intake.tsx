import { Camera, FileText, Lock, Upload } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Sample } from '../data/samples'
import type { Draft } from '../hooks/useCase'
import { addDays } from '../lib/dates'
import { ACCEPT_ATTRIBUTE, MAX_FILE_BYTES } from '../lib/file'
import { MAX_SOURCE_CHARS } from '../lib/prompts'
import type { AiProviderName, ExplainLanguage } from '../types'
import { buttonClass, primaryButtonClass } from './uiHelpers'

interface Props {
  draft: Draft
  setDraft: (update: (d: Draft) => Draft) => void
  today: string
  samples: Sample[]
  aiName: AiProviderName | null
  error: string | null
  onDismissError: () => void
  onAnalyse: () => void
  onFile: (file: File) => void
}

type Tab = 'paste' | 'upload'

export function Intake({ draft, setDraft, today, samples, aiName, error, onDismissError, onAnalyse, onFile }: Props) {
  const [tab, setTab] = useState<Tab>('paste')
  const [dragging, setDragging] = useState(false)
  const textId = useId()
  const dateId = useId()
  const langId = useId()
  const fileId = useId()
  const textRef = useRef<HTMLTextAreaElement>(null)

  const canSubmit = draft.text.trim().length > 0

  const pick = (file: File | undefined) => {
    if (!file) return
    if (file.name.toLowerCase().endsWith('.txt')) setTab('paste')
    onFile(file)
  }

  const loadSample = (s: Sample) => {
    setTab('paste')
    setDraft((d) => ({ ...d, text: s.text, receivedOn: addDays(today, -s.receivedDaysAgo) }))
    onDismissError()
    requestAnimationFrame(() => textRef.current?.focus())
  }

  const onTabKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      setTab((t) => (t === 'paste' ? 'upload' : 'paste'))
    }
  }

  const tabClass = (active: boolean) =>
    `flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-t-lg border border-b-0 px-3 py-2 text-sm font-semibold ${
      active ? 'border-line bg-card text-brand' : 'border-transparent bg-brandSoft text-muted hover:text-brand'
    }`

  return (
    <section aria-labelledby="intake-title" className="mx-auto max-w-3xl">
      <h2 id="intake-title" className="text-2xl font-bold text-brand sm:text-3xl">
        Got a legal notice? Let&rsquo;s make sense of it.
      </h2>
      <p className="mt-2 text-base text-muted">
        In about a minute you&rsquo;ll see what it is, how urgent it is, and what to do today. Every point comes with
        the exact words from your notice it was based on.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-danger/40 bg-dangerSoft p-3 text-sm text-danger"
        >
          <p>{error}</p>
          <button type="button" onClick={onDismissError} className="font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-6">
        <div role="tablist" aria-label="How to add your notice" className="flex gap-1" onKeyDown={onTabKey}>
          <button
            type="button"
            role="tab"
            id="tab-paste"
            aria-selected={tab === 'paste'}
            aria-controls="panel-paste"
            tabIndex={tab === 'paste' ? 0 : -1}
            className={tabClass(tab === 'paste')}
            onClick={() => setTab('paste')}
          >
            <FileText aria-hidden="true" size={18} /> Paste text
          </button>
          <button
            type="button"
            role="tab"
            id="tab-upload"
            aria-selected={tab === 'upload'}
            aria-controls="panel-upload"
            tabIndex={tab === 'upload' ? 0 : -1}
            className={tabClass(tab === 'upload')}
            onClick={() => setTab('upload')}
          >
            <Camera aria-hidden="true" size={18} /> Photo or PDF
          </button>
        </div>

        <div className="rounded-b-lg rounded-tr-lg border border-line bg-card p-4">
          <div role="tabpanel" id="panel-paste" aria-labelledby="tab-paste" hidden={tab !== 'paste'}>
            <label htmlFor={textId} className="block text-sm font-semibold">
              The text of your notice
            </label>
            <textarea
              id={textId}
              ref={textRef}
              value={draft.text}
              onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
              rows={12}
              maxLength={MAX_SOURCE_CHARS}
              placeholder="Paste the notice here. Hindi and English both work."
              className="mt-1 w-full rounded-lg border border-line bg-white p-3 font-serif text-base leading-relaxed"
            />
            <p className="mt-1 text-right text-xs text-muted">
              {draft.text.length.toLocaleString('en-IN')} / {MAX_SOURCE_CHARS.toLocaleString('en-IN')} characters
            </p>
          </div>

          <div role="tabpanel" id="panel-upload" aria-labelledby="tab-upload" hidden={tab !== 'upload'}>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                pick(e.dataTransfer.files[0])
              }}
              className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 text-center ${dragging ? 'border-brand bg-brandSoft' : 'border-line'}`}
            >
              <Upload aria-hidden="true" size={32} className="text-brand" />
              <p className="text-base font-semibold">Drop a photo or PDF of your notice here</p>
              <p className="text-sm text-muted">
                PNG, JPG, WebP, PDF or .txt · up to {MAX_FILE_BYTES / 1024 / 1024} MB. On a phone, choose Camera to take
                a photo.
              </p>
              <label
                htmlFor={fileId}
                className={`${buttonClass} cursor-pointer focus-within:outline focus-within:outline-[3px] focus-within:outline-brand`}
              >
                Choose a file
                <input
                  id={fileId}
                  type="file"
                  accept={ACCEPT_ATTRIBUTE}
                  className="sr-only"
                  onChange={(e) => {
                    pick(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </label>
              <p className="text-xs text-muted">
                You&rsquo;ll be able to check and correct the text we read before anything is analysed.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={dateId} className="block text-sm font-semibold">
            Date you received it
          </label>
          <input
            id={dateId}
            type="date"
            value={draft.receivedOn}
            max={today}
            onChange={(e) => e.target.value && setDraft((d) => ({ ...d, receivedOn: e.target.value }))}
            className="mt-1 min-h-[44px] w-full rounded-lg border border-line bg-white px-3"
            aria-describedby={`${dateId}-help`}
          />
          <p id={`${dateId}-help`} className="mt-1 text-xs text-muted">
            Time limits usually count from the day it reached you, not the date printed on it.
          </p>
        </div>
        <div>
          <label htmlFor={langId} className="block text-sm font-semibold">
            Explain it in
          </label>
          <select
            id={langId}
            value={draft.language}
            onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value as ExplainLanguage }))}
            className="mt-1 min-h-[44px] w-full rounded-lg border border-line bg-white px-3"
          >
            <option value="auto">Same language as the notice</option>
            <option value="en">English</option>
            <option value="hi">हिन्दी (Hindi)</option>
          </select>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onAnalyse} disabled={!canSubmit} className={primaryButtonClass}>
          Decode this notice
        </button>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Lock aria-hidden="true" size={14} />
          {aiName
            ? 'Your notice is sent to Google’s Gemini model to be read. Cited does not store it anywhere.'
            : 'No AI is connected here, so a simpler reader runs in your browser. Nothing leaves your device.'}
        </p>
      </div>

      <div className="mt-8 rounded-xl border border-line bg-white p-4">
        <h3 className="text-sm font-semibold">No notice handy? Try a sample</h3>
        <p className="mt-0.5 text-xs text-muted">
          Fictional notices, dated relative to today. They&rsquo;re analysed live, exactly like your own.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {samples.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => loadSample(s)}
                className={`${buttonClass} flex-col items-start !gap-0 text-left`}
              >
                <span lang={s.lang}>{s.label}</span>
                <span className="text-xs font-normal text-muted">{s.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
