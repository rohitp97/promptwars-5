/**
 * Combines regex literals into one case-insensitive alternation. It lets a long pattern be written
 * as a readable list, one alternative per line, instead of a single unreadable literal.
 */
export function anyOf(...parts: RegExp[]): RegExp {
  return new RegExp(parts.map((part) => part.source).join('|'), 'i')
}
