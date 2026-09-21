import type { ReactNode } from 'react'

type HeadingTag = 'h2' | 'h3' | 'h4' | 'h5'
const TAGS: HeadingTag[] = ['h2', 'h3', 'h4', 'h5']

/**
 * Renders the small Markdown subset the brief uses (#, ##, -, 1., >, ---, **bold**, _italic_)
 * as React nodes. Text is never interpreted as HTML, so a notice can't inject markup.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|(?<![\w])_([^_\s][^_]*?)_(?![\w])/g
  let last = 0
  let i = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(
      m[1] !== undefined ? (
        <strong key={`${keyBase}-${i++}`}>{m[1]}</strong>
      ) : (
        <em key={`${keyBase}-${i++}`}>{m[2]}</em>
      ),
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/**
 * `baseLevel` is the HTML heading level used for "# " (and +1 for "## "). The on-screen preview passes
 * 4 so it nests under the panel's h3; the printed copy uses the default 2.
 */
export function MarkdownLite({ text, baseLevel = 2 }: { text: string; baseLevel?: 2 | 4 }) {
  const H1 = TAGS[baseLevel - 2]
  const H2 = TAGS[baseLevel - 1]
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const key = `b${i}`

    if (line.trim() === '') {
      i++
    } else if (line.startsWith('# ')) {
      blocks.push(
        <H1 key={key} className="mb-2 text-xl font-bold text-brand">
          {inline(line.slice(2), key)}
        </H1>,
      )
      i++
    } else if (line.startsWith('## ')) {
      blocks.push(
        <H2 key={key} className="mb-1 mt-4 text-base font-semibold text-brand">
          {inline(line.slice(3), key)}
        </H2>,
      )
      i++
    } else if (line.trim() === '---') {
      blocks.push(<hr key={key} className="my-3 border-line" />)
      i++
    } else if (/^\s*>/.test(line)) {
      blocks.push(
        <blockquote key={key} className="my-1 border-l-4 border-mark pl-3 font-serif text-sm text-ink">
          {inline(line.replace(/^\s*>\s?/, ''), key)}
        </blockquote>,
      )
      i++
    } else if (/^- /.test(line) || /^\d+\. /.test(line)) {
      const ordered = /^\d+\. /.test(line)
      const items: ReactNode[] = []
      while (i < lines.length && (ordered ? /^\d+\. /.test(lines[i]) : /^- /.test(lines[i]))) {
        const itemKey = `${key}-${i}`
        const nested: ReactNode[] = []
        const content = lines[i].replace(/^(- |\d+\. )/, '')
        i++
        while (i < lines.length && /^\s+>/.test(lines[i])) {
          nested.push(
            <blockquote key={`${itemKey}-q${i}`} className="my-1 border-l-4 border-mark pl-3 font-serif text-sm">
              {inline(lines[i].replace(/^\s*>\s?/, ''), `${itemKey}-q${i}`)}
            </blockquote>,
          )
          i++
        }
        items.push(
          <li key={itemKey}>
            {inline(content, itemKey)}
            {nested}
          </li>,
        )
      }
      blocks.push(
        ordered ? (
          <ol key={key} className="my-1 list-decimal space-y-1 pl-6">
            {items}
          </ol>
        ) : (
          <ul key={key} className="my-1 list-disc space-y-1 pl-6">
            {items}
          </ul>
        ),
      )
    } else {
      blocks.push(
        <p key={key} className="my-1 text-sm">
          {inline(line, key)}
        </p>,
      )
      i++
    }
  }
  return <div className="leading-relaxed">{blocks}</div>
}
