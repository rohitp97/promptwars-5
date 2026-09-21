import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { Progress } from '../components/Chrome'
import { buildSamples } from '../data/samples'
import * as ai from '../lib/ai'
import { todayIso } from '../lib/dates'

vi.mock('../lib/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/ai')>()),
  createAiProvider: vi.fn(() => null),
}))
const createAiProvider = vi.mocked(ai.createAiProvider)

/**
 * axe-core against the real rendered screens. Colour contrast is excluded because jsdom does no
 * layout or painting; it is covered separately by contrast.test.ts against the real palette.
 */
async function violations(root: Element = document.body): Promise<string[]> {
  const results = await axe.run(root, { rules: { 'color-contrast': { enabled: false } } })
  return results.violations.map(
    (v) =>
      `${v.id} [${v.impact}]: ${v.help} — ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  )
}

const TRANSCRIPT = buildSamples(todayIso())[0].text

beforeEach(() => {
  createAiProvider.mockReturnValue(null)
  URL.createObjectURL = vi.fn(() => 'blob:preview') as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('accessibility (axe-core, WCAG 2 A/AA rules)', () => {
  it('the scan itself works: it flags deliberately inaccessible markup', async () => {
    render(
      <main>
        <img src="x.png" />
        <button />
        <input type="text" />
      </main>,
    )
    const found = await violations()
    expect(found.some((v) => v.startsWith('image-alt'))).toBe(true)
    expect(found.some((v) => v.startsWith('button-name'))).toBe(true)
    expect(found.some((v) => v.startsWith('label'))).toBe(true)
  })

  it('intake screen: paste tab', async () => {
    render(<App />)
    expect(await violations()).toEqual([])
  })

  it('intake screen: upload tab', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: /Photo or PDF/ }))
    expect(await violations()).toEqual([])
  })

  it('intake screen showing an error alert', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('The text of your notice'), 'hi')
    await user.click(screen.getByRole('button', { name: 'Decode this notice' }))
    await screen.findByRole('alert')
    expect(await violations()).toEqual([])
  })

  it.each([
    ['cheque bounce (typed, with statutory dates)', /Cheque bounce notice/],
    ['Hindi notice', /चेक बाउंस/],
    ['eviction notice', /Eviction notice/],
    ['notice with no playbook', /A notice with no playbook/],
  ])('results screen: %s', async (_label, sample) => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: sample }))
    await user.click(screen.getByRole('button', { name: 'Decode this notice' }))
    await screen.findByRole('heading', { name: 'Dates that matter' })
    expect(await violations()).toEqual([])
  })

  it('results screen with the verification details expanded and a passage highlighted', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Cheque bounce notice/ }))
    await user.click(screen.getByRole('button', { name: 'Decode this notice' }))
    await screen.findByRole('heading', { name: 'Dates that matter' })
    await user.click(screen.getByText(/statements checked:/))
    await user.click(screen.getAllByRole('button', { name: 'Show in notice' })[0])
    expect(await violations()).toEqual([])
  })

  it('photo review step (transcript checkpoint with image preview)', async () => {
    createAiProvider.mockReturnValue({ name: 'gemini-api-key', generate: async () => TRANSCRIPT })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: /Photo or PDF/ }))
    await user.upload(
      screen.getByLabelText('Choose a file', { selector: 'input' }),
      new File(['x'], 'notice.png', { type: 'image/png' }),
    )
    await screen.findByRole('heading', { name: 'Check what we read' })
    expect(await violations()).toEqual([])
  })

  it('progress screen', async () => {
    render(<Progress message="Reading your notice…" />)
    expect(await violations()).toEqual([])
  })
})
