import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import * as ai from '../lib/ai'
import type { AiProvider } from '../types'

vi.mock('../lib/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/ai')>()),
  createAiProvider: vi.fn(() => null),
}))
const createAiProvider = vi.mocked(ai.createAiProvider)

const ANALYSIS = JSON.stringify({
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

const PAY_QUOTE = 'pay the said sum of Rs. 1,50,000/- to my client'

const answerJson = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    answer: [
      {
        text: 'You are asked to pay Rs. 1,50,000.',
        why: 'It is the amount to pay or dispute.',
        quote: PAY_QUOTE,
        playbookRef: null,
      },
    ],
    notInNotice: null,
    lawyerQuestion: null,
    offTopic: false,
    ...over,
  })

type QaHandler = (question: string, call: number) => string | Promise<string>

/** Answers the analysis prompt with a fixed analysis and question prompts with whatever `qa` returns. */
function fakeAi(qa: QaHandler): AiProvider & { questions: string[] } {
  const questions: string[] = []
  return {
    name: 'gemini-api-key',
    questions,
    generate: async (req) => {
      if (!req.prompt.includes('<question>')) return ANALYSIS
      const question = /<question>\n([\s\S]*?)\n<\/question>/.exec(req.prompt)![1]
      questions.push(question)
      return qa(question, questions.length)
    },
  }
}

async function openResults(user: ReturnType<typeof userEvent.setup>, sample = /Cheque bounce notice/) {
  await user.click(screen.getByRole('button', { name: sample }))
  await user.click(screen.getByRole('button', { name: 'Decode this notice' }))
  return screen.findByRole('heading', { name: 'Ask about this notice' })
}

const panel = () => screen.getByRole('heading', { name: 'Ask about this notice' }).closest('section')!
const ask = async (user: ReturnType<typeof userEvent.setup>, question: string) => {
  await user.type(within(panel()).getByLabelText('Your question'), question)
  await user.click(within(panel()).getByRole('button', { name: 'Ask' }))
}

beforeEach(() => {
  createAiProvider.mockReturnValue(null)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('Ask about this notice', () => {
  it('is not shown until there are results', () => {
    render(<App />)
    expect(screen.queryByRole('heading', { name: 'Ask about this notice' })).not.toBeInTheDocument()
  })

  it('appears with a labelled input and starter questions for the detected notice type', async () => {
    createAiProvider.mockReturnValue(fakeAi(() => answerJson()))
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    const p = within(panel())
    expect(p.getByLabelText('Your question')).toBeInTheDocument()
    expect(p.getByRole('button', { name: 'How much am I being asked to pay?' })).toBeInTheDocument()
    expect(p.getByRole('button', { name: "What happens if I don't pay in time?" })).toBeInTheDocument()
    expect(p.getByRole('button', { name: 'Ask' })).toBeDisabled()
  })

  it('shows generic starters for a notice with no curated type', async () => {
    createAiProvider.mockReturnValue(null)
    const user = userEvent.setup()
    render(<App />)
    await openResults(user, /A notice with no playbook/)
    expect(within(panel()).getByRole('button', { name: 'What is this notice asking me to do?' })).toBeInTheDocument()
  })

  it('answers a typed question with a verified quote, and clears the box', async () => {
    const fake = fakeAi(() => answerJson())
    createAiProvider.mockReturnValue(fake)
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    await ask(user, 'How much do I have to pay?')

    const card = (await within(panel()).findByRole('heading', { name: 'How much do I have to pay?' })).closest('li')!
    expect(within(card).getByText('Answered from your notice')).toBeInTheDocument()
    expect(within(card).getByText('You are asked to pay Rs. 1,50,000.')).toBeInTheDocument()
    expect(within(card).getByText('Verified quote')).toBeInTheDocument()
    expect(within(card).getByText(new RegExp(PAY_QUOTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
    expect(fake.questions).toEqual(['How much do I have to pay?'])
    expect(within(panel()).getByLabelText('Your question')).toHaveValue('')
  })

  it('asks immediately when a starter question is clicked', async () => {
    const fake = fakeAi(() => answerJson())
    createAiProvider.mockReturnValue(fake)
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    await user.click(within(panel()).getByRole('button', { name: 'How much am I being asked to pay?' }))
    expect(
      await within(panel()).findByRole('heading', { name: 'How much am I being asked to pay?' }),
    ).toBeInTheDocument()
    expect(fake.questions).toEqual(['How much am I being asked to pay?'])
  })

  it('enables Ask only for a real question, and submits on Enter', async () => {
    const fake = fakeAi(() => answerJson())
    createAiProvider.mockReturnValue(fake)
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    const ask = within(panel()).getByRole('button', { name: 'Ask' })
    const box = within(panel()).getByLabelText('Your question')
    await user.type(box, 'hi')
    expect(ask).toBeDisabled()
    await user.type(box, 'w much?{Enter}')
    expect(await within(panel()).findByRole('heading', { name: 'hiw much?' })).toBeInTheDocument()
    expect(fake.questions).toEqual(['hiw much?'])
  })

  it('shows a pending state and announces the result to screen readers', async () => {
    let release: (v: string) => void = () => {}
    createAiProvider.mockReturnValue(fakeAi(() => new Promise<string>((r) => (release = r))))
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    await ask(user, 'How much do I pay?')

    const p = within(panel())
    expect(await p.findByRole('button', { name: /Checking/ })).toBeDisabled()
    expect(p.getByRole('button', { name: 'How much am I being asked to pay?' })).toBeDisabled()
    expect(p.getByText('Checking your notice for an answer.')).toBeInTheDocument()

    release(answerJson())
    await p.findByRole('heading', { name: 'How much do I pay?' })
    expect(p.getByText('Answer 1 ready: Answered from your notice.')).toBeInTheDocument()
    expect(p.getByRole('button', { name: 'Ask' })).toBeInTheDocument()
  })

  it('says plainly when the notice does not say', async () => {
    createAiProvider.mockReturnValue(
      fakeAi(() => answerJson({ answer: [], notInNotice: 'The notice never mentions a security deposit.' })),
    )
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    await ask(user, 'What about my deposit?')
    const card = (await within(panel()).findByRole('heading', { name: 'What about my deposit?' })).closest('li')!
    expect(within(card).getAllByText('Not in your notice').length).toBeGreaterThan(0)
    expect(within(card).getByText('The notice never mentions a security deposit.')).toBeInTheDocument()
  })

  it('shows a partly-answered reply with the gap and a question for a lawyer', async () => {
    createAiProvider.mockReturnValue(
      fakeAi(() =>
        answerJson({
          notInNotice: 'The notice does not say what punishment a court could give.',
          lawyerQuestion: 'What could happen if a complaint is filed?',
        }),
      ),
    )
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    await ask(user, 'Can I go to jail?')
    const card = (await within(panel()).findByRole('heading', { name: 'Can I go to jail?' })).closest('li')!
    expect(within(card).getByText('Partly answered')).toBeInTheDocument()
    expect(within(card).getByText('The notice does not say what punishment a court could give.')).toBeInTheDocument()
    expect(within(card).getByText(/What could happen if a complaint is filed\?/)).toBeInTheDocument()
  })

  it('declines an off-topic question without showing any statements', async () => {
    createAiProvider.mockReturnValue(fakeAi(() => answerJson({ answer: [], offTopic: true })))
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    await ask(user, 'Write me a poem')
    const card = (await within(panel()).findByRole('heading', { name: 'Write me a poem' })).closest('li')!
    expect(within(card).getByText('Not about this notice')).toBeInTheDocument()
    expect(within(card).getByText(/can only answer questions about this notice/i)).toBeInTheDocument()
    expect(within(card).queryByText('Verified quote')).not.toBeInTheDocument()
  })

  it('lists a fabricated statement as removed instead of showing it', async () => {
    createAiProvider.mockReturnValue(
      fakeAi(() =>
        answerJson({
          answer: [
            { text: 'You are asked to pay Rs. 1,50,000.', why: null, quote: PAY_QUOTE, playbookRef: null },
            {
              text: 'You also owe 10 lakh.',
              why: null,
              quote: 'you shall also pay ten lakh rupees as damages',
              playbookRef: null,
            },
          ],
        }),
      ),
    )
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    await ask(user, 'How much?')
    const card = (await within(panel()).findByRole('heading', { name: 'How much?' })).closest('li')!
    expect(within(card).getByText('You are asked to pay Rs. 1,50,000.')).toBeInTheDocument()
    // the invented figure is only inside the collapsed "removed" disclosure, never presented as an answer
    expect(within(card).getByText(/1 statement removed because they could not be verified/)).toBeInTheDocument()
    expect(within(card).getByText(/Quote not found in the notice/)).toBeInTheDocument()
    expect(within(card).getAllByText('Verified quote')).toHaveLength(1)
  })

  it('highlights the answer’s quote in the notice when "Show in notice" is used', async () => {
    createAiProvider.mockReturnValue(fakeAi(() => answerJson()))
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    await ask(user, 'How much do I pay?')
    const card = (await within(panel()).findByRole('heading', { name: 'How much do I pay?' })).closest('li')!
    const locate = within(card).getByRole('button', { name: 'Show in notice' })
    expect(locate).toHaveAttribute('aria-pressed', 'false')
    await user.click(locate)
    expect(locate).toHaveAttribute('aria-pressed', 'true')
    const active = document.querySelector('mark[data-active="true"]')
    expect(active?.textContent).toContain('pay the said sum')
  })

  it('lists the newest answer first', async () => {
    createAiProvider.mockReturnValue(
      fakeAi((q) =>
        answerJson({ answer: [{ text: `Reply to ${q}`, why: null, quote: PAY_QUOTE, playbookRef: null }] }),
      ),
    )
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    await ask(user, 'First question?')
    await within(panel()).findByRole('heading', { name: 'First question?' })
    await ask(user, 'Second question?')
    await within(panel()).findByRole('heading', { name: 'Second question?' })
    const headings = within(panel())
      .getAllByRole('heading', { level: 4 })
      .map((h) => h.textContent)
    expect(headings.slice(0, 2)).toEqual(['Second question?', 'First question?'])
  })

  it('accepts a Hindi question and passes it to the model intact', async () => {
    const fake = fakeAi(() => answerJson())
    createAiProvider.mockReturnValue(fake)
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    await ask(user, 'मुझे कितना भुगतान करना है?')
    await within(panel()).findByRole('heading', { name: 'मुझे कितना भुगतान करना है?' })
    expect(fake.questions).toEqual(['मुझे कितना भुगतान करना है?'])
  })

  it('degrades to labelled keyword search when the AI fails, instead of breaking', async () => {
    createAiProvider.mockReturnValue(
      fakeAi(() => {
        throw new Error('[500] This model is currently experiencing high demand.')
      }),
    )
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    await ask(user, 'How much do I pay?')
    const card = (await within(panel()).findByRole('heading', { name: 'How much do I pay?' })).closest('li')!
    expect(within(card).getByText('Keyword search, not an AI answer.')).toBeInTheDocument()
    expect(within(card).getByText(/very busy/)).toBeInTheDocument()
    expect(within(card).getAllByText('Verified quote').length).toBeGreaterThan(0)
  })

  it('works with no AI at all, as keyword search over the notice', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    await ask(user, 'How much do I have to pay?')
    const card = (await within(panel()).findByRole('heading', { name: 'How much do I have to pay?' })).closest('li')!
    expect(within(card).getByText('Keyword search, not an AI answer.')).toBeInTheDocument()
    expect(within(card).getByText(/No AI is configured/)).toBeInTheDocument()
    expect(within(card).getAllByText(/pay/i).length).toBeGreaterThan(0)
  })

  it('says so honestly when keyword search finds nothing', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    await ask(user, 'zebra giraffe')
    const card = (await within(panel()).findByRole('heading', { name: 'zebra giraffe' })).closest('li')!
    expect(within(card).getByText(/No passage in your notice seems to use those words/)).toBeInTheDocument()
  })

  it('"Start over" removes the answers, and a new notice starts clean', async () => {
    createAiProvider.mockReturnValue(fakeAi(() => answerJson()))
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    await ask(user, 'How much do I pay?')
    await within(panel()).findByRole('heading', { name: 'How much do I pay?' })
    await user.click(screen.getByRole('button', { name: /Start over/ }))
    await openResults(user)
    expect(within(panel()).queryByRole('heading', { name: 'How much do I pay?' })).not.toBeInTheDocument()
  })

  it('ignores a slow answer that arrives after the person cleared everything', async () => {
    let release: (v: string) => void = () => {}
    createAiProvider.mockReturnValue(fakeAi(() => new Promise<string>((r) => (release = r))))
    const user = userEvent.setup()
    render(<App />)
    await openResults(user)
    await ask(user, 'How much do I pay?')
    await user.click(await screen.findByRole('button', { name: /Clear everything/ }))
    release(answerJson())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('heading', { name: 'How much do I pay?' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ask about this notice' })).not.toBeInTheDocument()
  })
})
