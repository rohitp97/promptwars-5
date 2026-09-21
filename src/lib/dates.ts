import type { IsoDate } from '../types'

/**
 * Date-only arithmetic on YYYY-MM-DD strings using the proleptic Gregorian calendar
 * (Howard Hinnant's civil-days algorithms). Deliberately avoids `Date`: no timezone or DST
 * drift can move a legal deadline by a day.
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const MIN_YEAR = 1900
const MAX_YEAR = 2200

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28
  return [4, 6, 9, 11].includes(m) ? 30 : 31
}

interface Ymd {
  y: number
  m: number
  d: number
}

export function parseIso(value: string): Ymd | null {
  const match = ISO_RE.exec(value)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null
  return { y, m, d }
}

export function isValidIso(value: unknown): value is IsoDate {
  return typeof value === 'string' && parseIso(value) !== null
}

function daysFromCivil({ y, m, d }: Ymd): number {
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

function civilFromDays(z0: number): Ymd {
  const z = z0 + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0)
  return { y, m, d }
}

const pad = (n: number, width: number): string => String(n).padStart(width, '0')
const format = ({ y, m, d }: Ymd): IsoDate => `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`

function mustParse(iso: IsoDate): Ymd {
  const parsed = parseIso(iso)
  if (!parsed) throw new RangeError(`Invalid ISO date: ${iso}`)
  return parsed
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return format(civilFromDays(daysFromCivil(mustParse(iso)) + days))
}

/** Adds calendar months; if the target month is shorter the day clamps to month-end (31 Jan + 1 mo = 28/29 Feb). */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const { y, m, d } = mustParse(iso)
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12 + 12) % 12 + 1
  return format({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) })
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return daysFromCivil(mustParse(to)) - daysFromCivil(mustParse(from))
}

/** The local calendar date, as the user experiences "today". */
export function todayIso(now: Date = new Date()): IsoDate {
  return format({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() })
}

/** "5 October 2026" — fixed English month names so output never depends on the runtime locale. */
export function formatLong(iso: IsoDate): string {
  const { y, m, d } = mustParse(iso)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** Compact form used in prose like "15 days from 5 Oct 2026". */
export function formatShort(iso: IsoDate): string {
  const { y, m, d } = mustParse(iso)
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`
}

/** "October", "oct", "Oct.", "Sept" → 10 / 10 / 10 / 9. */
export function monthNumber(name: string): number | null {
  const lower = name.trim().toLowerCase().replace(/\.$/, '')
  const idx = MONTHS.findIndex((mn) => {
    const full = mn.toLowerCase()
    return lower === full || lower === full.slice(0, 3) || (lower === 'sept' && full === 'september')
  })
  return idx === -1 ? null : idx + 1
}

export function buildIso(y: number, m: number, d: number): IsoDate | null {
  const iso = `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`
  return parseIso(iso) ? iso : null
}
