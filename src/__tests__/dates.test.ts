// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  buildIso,
  daysInMonth,
  diffDays,
  formatLong,
  formatShort,
  isLeapYear,
  isValidIso,
  monthNumber,
  parseIso,
  todayIso,
} from '../lib/dates'

describe('leap years and month lengths', () => {
  it('follows the Gregorian rules', () => {
    expect(isLeapYear(2028)).toBe(true)
    expect(isLeapYear(2100)).toBe(false)
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(2026)).toBe(false)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 12)).toBe(31)
  })
})

describe('isValidIso / parseIso', () => {
  it('accepts real dates', () => {
    expect(isValidIso('2026-10-12')).toBe(true)
    expect(isValidIso('2028-02-29')).toBe(true)
  })

  it('rejects impossible or malformed dates', () => {
    for (const bad of [
      '2026-02-29',
      '2026-13-01',
      '2026-00-10',
      '2026-04-31',
      '26-10-12',
      '2026/10/12',
      '2026-1-2',
      '',
      ' 2026-10-12',
      '1800-01-01',
      '3000-01-01',
    ]) {
      expect(isValidIso(bad), bad).toBe(false)
    }
    expect(isValidIso(20261012)).toBe(false)
    expect(isValidIso(null)).toBe(false)
    expect(parseIso('nope')).toBeNull()
  })
})

describe('addDays', () => {
  it('adds within a month', () => expect(addDays('2026-10-01', 15)).toBe('2026-10-16'))
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-10-25', 15)).toBe('2026-11-09')
    expect(addDays('2026-12-25', 10)).toBe('2027-01-04')
  })
  it('handles leap days', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })
  it('handles zero and negative offsets', () => {
    expect(addDays('2026-03-01', 0)).toBe('2026-03-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
  it('handles a 60-day span and a 3650-day span', () => {
    expect(addDays('2026-10-10', 60)).toBe('2026-12-09')
    expect(addDays('2026-01-01', 3650)).toBe('2035-12-30')
  })
  it('throws on an invalid date rather than returning garbage', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError)
  })
})

describe('addMonths', () => {
  it('adds calendar months', () => expect(addMonths('2026-10-27', 1)).toBe('2026-11-27'))
  it('clamps to month-end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-08-31', 1)).toBe('2026-09-30')
  })
  it('rolls over the year and supports negative months', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
    expect(addMonths('2026-03-15', 0)).toBe('2026-03-15')
  })
})

describe('diffDays', () => {
  it('is signed and symmetric', () => {
    expect(diffDays('2026-10-01', '2026-10-16')).toBe(15)
    expect(diffDays('2026-10-16', '2026-10-01')).toBe(-15)
    expect(diffDays('2026-10-01', '2026-10-01')).toBe(0)
  })
  it('spans leap years correctly', () => {
    expect(diffDays('2027-12-31', '2028-12-31')).toBe(366)
    expect(diffDays('2026-12-31', '2027-12-31')).toBe(365)
  })
})

describe('formatting and helpers', () => {
  it('formats fixed English month names', () => {
    expect(formatLong('2026-10-05')).toBe('5 October 2026')
    expect(formatShort('2026-10-05')).toBe('5 Oct 2026')
  })
  it('uses the local calendar date for today', () => {
    expect(todayIso(new Date(2026, 8, 21, 23, 59))).toBe('2026-09-21')
    expect(todayIso(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01')
  })
  it('parses month names and abbreviations', () => {
    expect(monthNumber('October')).toBe(10)
    expect(monthNumber('oct')).toBe(10)
    expect(monthNumber('Sept')).toBe(9)
    expect(monthNumber('May.')).toBe(5)
    expect(monthNumber('Octo')).toBeNull()
    expect(monthNumber('xyz')).toBeNull()
  })
  it('buildIso returns null for impossible dates', () => {
    expect(buildIso(2026, 2, 29)).toBeNull()
    expect(buildIso(2028, 2, 29)).toBe('2028-02-29')
  })
})
