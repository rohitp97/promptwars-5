import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createAiProvider } from '../lib/ai'
import { todayIso } from '../lib/dates'
import { checkFile, readAsBase64, readAsText } from '../lib/file'
import { UserError, analyseNotice, transcribeFile } from '../lib/pipeline'
import { MAX_ANSWERS, askQuestion } from '../lib/qa'
import type { AiProviderName, AnalysisResult, ExplainLanguage, IntakeOptions, VerifiedAnswer } from '../types'

export interface Draft {
  text: string
  receivedOn: string
  language: ExplainLanguage
}

export type Phase =
  | { kind: 'intake' }
  | { kind: 'reading'; fileName: string }
  | { kind: 'review'; fileName: string; text: string; previewUrl: string | null }
  | { kind: 'analysing' }
  | { kind: 'result'; result: AnalysisResult }

const GENERIC_ERROR = 'Something went wrong on our side. Nothing was saved. Please try again.'

function messageOf(err: unknown): string {
  return err instanceof UserError ? err.message : GENERIC_ERROR
}

/**
 * One notice, start to finish. State lives only in memory: nothing is written to storage or sent to
 * a database, and `reset()` clears everything, including any preview image.
 */
export function useCase() {
  const provider = useMemo(() => createAiProvider(), [])
  const today = useMemo(() => todayIso(), [])
  const [draft, setDraft] = useState<Draft>({ text: '', receivedOn: today, language: 'auto' })
  const [phase, setPhase] = useState<Phase>({ kind: 'intake' })
  const [error, setError] = useState<string | null>(null)

  // Questions asked about the current result, newest first. Cleared with the case.
  const [answers, setAnswers] = useState<VerifiedAnswer[]>([])
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState<string | null>(null)

  // Bumped on every new request and on reset, so a slow response can't resurrect a cleared case.
  const runId = useRef(0)
  const askId = useRef(0)
  const previewUrl = useRef<string | null>(null)

  const clearQuestions = useCallback(() => {
    askId.current++
    setAnswers([])
    setAsking(false)
    setAskError(null)
  }, [])

  const revokePreview = useCallback(() => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = null
  }, [])
  useEffect(() => revokePreview, [revokePreview])

  const options = (d: Draft): IntakeOptions => ({ receivedOn: d.receivedOn, language: d.language })

  const runAnalysis = useCallback(
    async (text: string, d: Draft) => {
      const id = ++runId.current
      setError(null)
      clearQuestions()
      setPhase({ kind: 'analysing' })
      try {
        const result = await analyseNotice(text, options(d), { provider })
        if (id === runId.current) setPhase({ kind: 'result', result })
      } catch (err) {
        if (id !== runId.current) return
        setError(messageOf(err))
        setPhase({ kind: 'intake' })
      }
    },
    [provider, clearQuestions],
  )

  const ask = useCallback(
    async (question: string) => {
      if (phase.kind !== 'result') return
      const id = ++askId.current
      setAsking(true)
      setAskError(null)
      try {
        const answer = await askQuestion(question, phase.result, { provider })
        if (id === askId.current) setAnswers((prev) => [answer, ...prev].slice(0, MAX_ANSWERS))
      } catch (err) {
        if (id === askId.current) setAskError(messageOf(err))
      } finally {
        if (id === askId.current) setAsking(false)
      }
    },
    [phase, provider],
  )

  const analyse = useCallback(() => runAnalysis(draft.text, draft), [runAnalysis, draft])

  const readFile = useCallback(
    async (file: File) => {
      setError(null)
      const check = checkFile(file)
      if (!check.ok) {
        setError(check.message)
        return
      }
      const id = ++runId.current
      try {
        if (check.kind === 'text') {
          const text = await readAsText(file)
          if (id === runId.current) setDraft((d) => ({ ...d, text }))
          return
        }
        setPhase({ kind: 'reading', fileName: file.name })
        const base64 = await readAsBase64(file)
        const text = await transcribeFile({ name: file.name, mimeType: check.mimeType, base64 }, { provider })
        if (id !== runId.current) return
        revokePreview()
        previewUrl.current = check.kind === 'image' ? URL.createObjectURL(file) : null
        setPhase({ kind: 'review', fileName: file.name, text, previewUrl: previewUrl.current })
      } catch (err) {
        if (id !== runId.current) return
        setError(messageOf(err))
        setPhase({ kind: 'intake' })
      }
    },
    [provider, revokePreview],
  )

  const confirmTranscript = useCallback(
    (text: string) => {
      const next = { ...draft, text }
      setDraft(next)
      return runAnalysis(text, next)
    },
    [draft, runAnalysis],
  )

  const backToIntake = useCallback(() => {
    runId.current++
    revokePreview()
    clearQuestions()
    setError(null)
    setPhase({ kind: 'intake' })
  }, [revokePreview, clearQuestions])

  const reset = useCallback(() => {
    runId.current++
    revokePreview()
    clearQuestions()
    setDraft({ text: '', receivedOn: today, language: 'auto' })
    setError(null)
    setPhase({ kind: 'intake' })
  }, [revokePreview, clearQuestions, today])

  return {
    today,
    draft,
    setDraft,
    phase,
    error,
    dismissError: () => setError(null),
    analyse,
    readFile,
    confirmTranscript,
    backToIntake,
    reset,
    qa: { answers, asking, error: askError, ask, dismissError: () => setAskError(null) },
    aiName: (provider?.name ?? null) as AiProviderName | null,
  }
}
