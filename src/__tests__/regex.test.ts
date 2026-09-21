// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { anyOf } from '../lib/regex'

describe('anyOf', () => {
  it('matches when any one alternative matches', () => {
    const re = anyOf(/cat/, /dog/, /\b\d{3}\b/)
    expect(re.test('a cat')).toBe(true)
    expect(re.test('hot dog')).toBe(true)
    expect(re.test('error 404 here')).toBe(true)
  })

  it('does not match when none do', () => {
    expect(anyOf(/cat/, /dog/).test('a bird')).toBe(false)
  })

  it('is case-insensitive regardless of the flags on the parts', () => {
    expect(anyOf(/cat/).test('CAT')).toBe(true)
  })

  it('keeps each part intact, including groups and escapes', () => {
    const re = anyOf(/AI\/(no-key|no-app)/, /not[ -]enabled/)
    expect(re.test('AI/no-app')).toBe(true)
    expect(re.test('is not-enabled')).toBe(true)
    expect(re.test('AI/other')).toBe(false)
  })

  it('has no state between calls (no global flag)', () => {
    const re = anyOf(/x/)
    expect(re.test('x')).toBe(true)
    expect(re.test('x')).toBe(true)
  })

  it('with no parts matches nothing but the empty string', () => {
    expect(anyOf().test('anything')).toBe(true)
    expect(anyOf().source).toBe('(?:)')
  })
})
