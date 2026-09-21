import { addDays } from './dates'
import type { AnalysisResult } from '../types'

const CRLF = '\r\n'
const MAX_LINE_BYTES = 75

/** RFC 5545 §3.3.11 TEXT escaping. */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Fold to ≤ 75 octets per line, never splitting a multi-byte character (Devanagari is 3 bytes/char). */
export function foldLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= MAX_LINE_BYTES) return line
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const size = encoder.encode(ch).length
    // Continuation lines start with a space, which costs one octet.
    const limit = parts.length === 0 ? MAX_LINE_BYTES : MAX_LINE_BYTES - 1
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += size
  }
  parts.push(current)
  return parts.join(CRLF + ' ')
}

const compact = (iso: string): string => iso.replace(/-/g, '')

function stamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}

/**
 * All-day calendar events for every deadline that has a date and hasn't passed, each with a
 * one-day-before reminder. Returns null when there is nothing to add.
 */
export function buildIcs(result: AnalysisResult, now: Date = new Date()): string | null {
  const upcoming = result.deadlines.filter((d) => d.date !== null && d.date >= result.analysedOn)
  if (upcoming.length === 0) return null

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cited//Legal notice deadlines//EN',
    'CALSCALE:GREGORIAN',
  ]
  for (const d of upcoming) {
    const date = d.date as string
    const note =
      d.origin === 'statute'
        ? 'General information from the Cited playbook, not from your notice.'
        : 'Stated in your notice.'
    lines.push(
      'BEGIN:VEVENT',
      `UID:${d.id}-${compact(date)}@cited.app`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compact(date)}`,
      `DTEND;VALUE=DATE:${compact(addDays(date, 1))}`,
      `SUMMARY:${escapeIcsText(`Legal notice: ${d.label}`)}`,
      `DESCRIPTION:${escapeIcsText(`${d.basis} ${note} Information only, not legal advice.`)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Legal notice deadline tomorrow',
      'TRIGGER:-P1D',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join(CRLF) + CRLF
}
