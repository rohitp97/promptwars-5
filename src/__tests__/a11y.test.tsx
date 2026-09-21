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

/** A minimal but valid analysis reply, for tests that need the AI path to reach the results screen. */
const TRANSCRIPT_ANALYSIS = JSON.stringify({
  noticeType: 'cheque_bounce',
  documentLanguage: 'English',
  noticeDate: null,
  noticeDateQuote: null,
  whatItIs: [
    {
      text: 'A cheque-bounce demand notice.',
      why: null,
      quote: 'LEGAL NOTICE UNDER SECTION 138 OF THE NEGOTIABLE INSTRUMENTS ACT, 1881',
      playbookRef: null,
    },
  ],
  demands: [],
  senderClaims: [],
  consequences: [],
  options: [],
  doNow: [],
  deadlines: [],
  notStated: [],
  lawyerQuestions: [],
})

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

  it('question panel with answers: verified passages, "not in your notice", and an off-topic decline', async () => {
    const answers: Record<string, string> = {
      'How much do I pay?': JSON.stringify({
        answer: [
          {
            text: 'You are asked to pay.',
            why: 'It is the amount.',
            quote: 'pay the said sum of Rs. 1,50,000/-',
            playbookRef: null,
          },
        ],
        notInNotice: 'The notice does not say which bank returned the cheque.',
        lawyerQuestion: 'Was the notice sent in time?',
        offTopic: false,
      }),
      'What about my deposit?': JSON.stringify({
        answer: [],
        notInNotice: null,
        lawyerQuestion: null,
        offTopic: false,
      }),
      'Write me a poem': JSON.stringify({ answer: [], notInNotice: null, lawyerQuestion: null, offTopic: true }),
    }
    createAiProvider.mockReturnValue({
      name: 'gemini-api-key',
      generate: async (req) => {
        const q = /<question>\n([\s\S]*?)\n<\/question>/.exec(req.prompt)?.[1]
        if (q === undefined) return TRANSCRIPT_ANALYSIS
        return answers[q]
      },
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Cheque bounce notice/ }))
    await user.click(screen.getByRole('button', { name: 'Decode this notice' }))
    await screen.findByRole('heading', { name: 'Ask about this notice' })

    for (const question of Object.keys(answers)) {
      await user.type(screen.getByLabelText('Your question'), question)
      await user.click(screen.getByRole('button', { name: 'Ask' }))
      await screen.findByRole('heading', { name: question, level: 4 })
    }
    await user.click(screen.getAllByRole('button', { name: 'Show in notice' }).at(-1)!)
    expect(await violations()).toEqual([])
  })

  it('question panel while an answer is pending, and after a keyword-search fallback', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Cheque bounce notice/ }))
    await user.click(screen.getByRole('button', { name: 'Decode this notice' }))
    await screen.findByRole('heading', { name: 'Ask about this notice' })
    await user.click(screen.getByRole('button', { name: 'How much am I being asked to pay?' }))
    await screen.findByRole('heading', { name: 'How much am I being asked to pay?', level: 4 })
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
