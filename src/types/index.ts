/** YYYY-MM-DD. Date-only strings avoid every timezone bug a JS Date invites. */
export type IsoDate = string

export type NoticeTypeId =
  'cheque_bounce' | 'eviction_rent' | 'loan_recovery' | 'employment_dispute' | 'consumer_demand'

/** 'other' means the notice matched no curated playbook — the app must not invent guidance. */
export type NoticeType = NoticeTypeId | 'other'

export type FindingSection = 'whatItIs' | 'demands' | 'senderClaims' | 'consequences' | 'options' | 'doNow'

/** Sections that describe the notice itself, so they must rest on a quote from it. */
export const DOCUMENT_ONLY_SECTIONS: readonly FindingSection[] = ['whatItIs', 'demands', 'senderClaims', 'consequences']

// ── Model → app contract ──────────────────────────────────────────────────────

export interface RawFinding {
  text: string
  why: string | null
  quote: string | null
  playbookRef: string | null
}

export interface RawDeadline {
  label: string
  quote: string
  kind: 'absolute' | 'relative'
  date: IsoDate | null
  days: number | null
  from: 'receipt' | 'notice_date' | 'other' | null
}

export interface RawNotStated {
  question: string
  whyItMatters: string
}

export interface AnalysisResponse {
  noticeType: string
  documentLanguage: string
  noticeDate: IsoDate | null
  /** Verbatim excerpt showing the notice date; the date is discarded unless this quote verifies. */
  noticeDateQuote: string | null
  whatItIs: RawFinding[]
  demands: RawFinding[]
  senderClaims: RawFinding[]
  consequences: RawFinding[]
  options: RawFinding[]
  doNow: RawFinding[]
  deadlines: RawDeadline[]
  notStated: RawNotStated[]
  lawyerQuestions: string[]
}

/** Result of parsing raw model JSON: valid items plus a count of items dropped as malformed. */
export interface ParsedAnalysis {
  response: AnalysisResponse
  malformed: number
}

// ── Verification ──────────────────────────────────────────────────────────────

export type MatchStatus = 'verified' | 'approximate' | 'unverified'

export interface QuoteMatch {
  status: MatchStatus
  /** Offsets into the ORIGINAL source text. -1 when unverified. */
  start: number
  end: number
  /** 1 for an exact normalised match, otherwise the n-gram coverage 0..1. */
  score: number
  reason?: string
}

export type Provenance =
  | { kind: 'document'; status: 'verified' | 'approximate'; quote: string; start: number; end: number }
  | { kind: 'playbook'; ref: string; refLabel: string }

export interface VerifiedFinding {
  id: string
  section: FindingSection
  text: string
  why: string | null
  provenance: Provenance
}

export interface RemovedFinding {
  section: FindingSection | 'deadlines' | 'malformed'
  text: string
  reason: string
}

export interface VerificationSummary {
  checked: number
  verified: number
  approximate: number
  playbook: number
  removed: number
}

// ── Deadlines & urgency ───────────────────────────────────────────────────────

export interface ResolvedDeadline {
  id: string
  label: string
  origin: 'notice' | 'statute'
  /** null when the date cannot be computed from what is known. */
  date: IsoDate | null
  /** Plain-language explanation of how the date was (or wasn't) worked out. */
  basis: string
  provenance: Provenance
  statuteRef?: string
}

export type UrgencyLevel = 'overdue' | 'critical' | 'high' | 'moderate' | 'low' | 'unknown'

export interface Urgency {
  level: UrgencyLevel
  reason: string
}

// ── Assembled result ──────────────────────────────────────────────────────────

export type AnalysisSource = 'gemini' | 'fallback'

export interface AnalysisResult {
  source: AnalysisSource
  /** Set when the app fell back, explaining why (shown to the user). */
  fallbackReason: string | null
  noticeType: NoticeType
  documentLanguage: string
  noticeDate: IsoDate | null
  receivedOn: IsoDate
  analysedOn: IsoDate
  sourceText: string
  findings: Record<FindingSection, VerifiedFinding[]>
  deadlines: ResolvedDeadline[]
  urgency: Urgency
  notStated: RawNotStated[]
  lawyerQuestions: string[]
  removed: RemovedFinding[]
  summary: VerificationSummary
}

// ── Intake ────────────────────────────────────────────────────────────────────

export type ExplainLanguage = 'auto' | 'en' | 'hi'

export interface IntakeOptions {
  receivedOn: IsoDate
  language: ExplainLanguage
}

export interface UploadedFile {
  name: string
  mimeType: string
  base64: string
}

/** Structured request to the AI provider, independent of which SDK serves it. */
export interface AiRequest {
  systemInstruction: string
  prompt: string
  json: boolean
  file?: { mimeType: string; base64: string }
}

export type AiProviderName = 'firebase-ai-logic' | 'gemini-api-key'

export interface AiProvider {
  name: AiProviderName
  generate(request: AiRequest): Promise<string>
}
