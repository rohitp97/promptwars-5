import { useId, useState } from 'react'
import { MAX_SOURCE_CHARS } from '../lib/prompts'
import { buttonClass, primaryButtonClass } from './uiHelpers'

interface Props {
  fileName: string
  initialText: string
  previewUrl: string | null
  onConfirm: (text: string) => void
  onBack: () => void
}

/** A checkpoint: the person confirms what was read before any claim is made about it. */
export function TranscriptReview({ fileName, initialText, previewUrl, onConfirm, onBack }: Props) {
  const [text, setText] = useState(initialText)
  const id = useId()

  return (
    <section aria-labelledby="review-title" className="mx-auto max-w-5xl">
      <h2 id="review-title" className="text-2xl font-bold text-brand">
        Check what we read
      </h2>
      <p className="mt-2 text-base text-muted">
        Compare this with your document and fix any mistakes. Every quote in the results is checked against exactly this text, so
        getting it right here matters most for names, amounts and dates.
      </p>

      <div className={`mt-4 grid gap-4 ${previewUrl ? 'md:grid-cols-2' : ''}`}>
        {previewUrl && (
          <figure className="rounded-lg border border-line bg-white p-2">
            <img src={previewUrl} alt={`The photo you uploaded: ${fileName}`} className="max-h-[70vh] w-full object-contain" />
            <figcaption className="mt-1 text-xs text-muted">{fileName}</figcaption>
          </figure>
        )}
        <div>
          <label htmlFor={id} className="block text-sm font-semibold">
            Text read from {fileName}
          </label>
          <textarea
            id={id}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            maxLength={MAX_SOURCE_CHARS}
            className="mt-1 w-full rounded-lg border border-line bg-white p-3 font-serif text-base leading-relaxed"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className={primaryButtonClass} disabled={text.trim().length === 0} onClick={() => onConfirm(text)}>
          Looks right — decode it
        </button>
        <button type="button" className={buttonClass} onClick={onBack}>
          Choose a different file
        </button>
      </div>
    </section>
  )
}
