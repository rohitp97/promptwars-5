import { getPlaybookEntry } from '../data/playbook'
import type { AnalysisResult, FindingSection, Provenance, VerifiedFinding } from '../types'
import { diffDays, formatLong } from './dates'

const SECTION_TITLES: Record<FindingSection, string> = {
  whatItIs: 'What this notice is',
  demands: 'What the sender demands',
  senderClaims: 'What the sender claims',
  consequences: 'What the sender says will happen',
  options: 'Options (general information)',
  doNow: 'Suggested next steps',
}

const ORDER: readonly FindingSection[] = ['whatItIs', 'demands', 'senderClaims', 'consequences', 'options', 'doNow']

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

export function provenanceLabel(p: Provenance): string {
  if (p.kind === 'playbook') return 'General information — not from the notice'
  return p.status === 'verified' ? 'From the notice (quote verified)' : 'From the notice (approximate match)'
}

function findingLines(f: VerifiedFinding): string[] {
  const lines = [`- ${oneLine(f.text)} _(${provenanceLabel(f.provenance)})_`]
  if (f.provenance.kind === 'document') lines.push(`  > ${oneLine(f.provenance.quote)}`)
  return lines
}

/**
 * A one-page brief a person can hand to a lawyer: facts with their quotes, dates, and questions.
 * Pure markdown so it can be copied, downloaded, or rendered.
 */
export function buildBriefMarkdown(result: AnalysisResult): string {
  const entry = getPlaybookEntry(result.noticeType)
  const out: string[] = []

  out.push('# Legal notice brief', '')
  out.push(
    `Prepared with Cited on ${formatLong(result.analysedOn)}. Notice received on ${formatLong(result.receivedOn)}` +
      (result.noticeDate ? `; dated ${formatLong(result.noticeDate)}.` : '.'),
    '',
    '_This brief is information to help a conversation with a lawyer. It is not legal advice._',
    '',
  )
  out.push(`**Type:** ${entry ? entry.title : 'Not matched to a curated type'}  `)
  out.push(`**Urgency:** ${result.urgency.level} — ${result.urgency.reason}`, '')

  const dated = result.deadlines.filter((d) => d.date !== null)
  out.push('## Key dates', '')
  if (result.deadlines.length === 0) out.push('_No dates could be worked out from the notice._')
  for (const d of result.deadlines) {
    const when = d.date
      ? `${formatLong(d.date)} (${describeDaysLeft(diffDays(result.analysedOn, d.date))})`
      : 'date not computable'
    const src = d.origin === 'notice' ? 'in the notice' : 'general rule'
    out.push(`- **${oneLine(d.label)}** — ${when} — _${src}_. ${oneLine(d.basis)}`)
  }
  if (dated.length === 0 && result.deadlines.length > 0)
    out.push('', '_None of these could be turned into a calendar date._')
  out.push('')

  for (const section of ORDER) {
    const list = result.findings[section]
    if (list.length === 0) continue
    out.push(`## ${SECTION_TITLES[section]}`, '')
    for (const f of list) out.push(...findingLines(f))
    out.push('')
  }

  if (result.notStated.length > 0) {
    out.push("## What the notice doesn't say", '')
    for (const n of result.notStated) out.push(`- **${oneLine(n.question)}** ${oneLine(n.whyItMatters)}`)
    out.push('')
  }

  if (entry) {
    out.push('## Documents to bring', '')
    for (const d of entry.documents) out.push(`- ${d.text}`)
    out.push('')
  }

  out.push('## Questions to ask the lawyer', '')
  result.lawyerQuestions.forEach((q, i) => out.push(`${i + 1}. ${oneLine(q)}`))
  out.push('')

  const s = result.summary
  out.push(
    '---',
    `Verification: ${s.checked} statements checked — ${s.verified} verified quotes, ${s.approximate} approximate, ${s.playbook} general-information, ${s.removed} removed as unverifiable.`,
  )
  return out.join('\n')
}

export function describeDaysLeft(n: number): string {
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  return n > 0 ? `in ${n} days` : `${Math.abs(n)} days ago`
}
