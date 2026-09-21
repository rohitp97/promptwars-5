import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { MarkdownLite } from '../components/MarkdownLite'
import { buildSamples } from '../data/samples'
import * as ai from '../lib/ai'
import { todayIso } from '../lib/dates'
import type { AiProvider } from '../types'

vi.mock('../lib/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/ai')>()),
  createAiProvider: vi.fn(() => null),
}))

const createAiProvider = vi.mocked(ai.createAiProvider)

const fakeProvider = (payload: unknown | (() => string)): AiProvider => ({
  name: 'gemini-api-key',
  generate: async () => (typeof payload === 'function' ? (payload as () => string)() : JSON.stringify(payload)),
})

const chequePayload = (over: Record<string, unknown> = {}) => ({
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
  demands: [
    {
      text: 'Pay Rs. 1,50,000.',
      why: 'It is the amount to pay or dispute.',
      quote: 'pay the said sum of Rs. 1,50,000/- to my client within 15 days of receipt of this notice',
      playbookRef: null,
    },
    {
      text: 'Also pay Rs. 10 lakh in damages.',
      why: null,
      quote: 'you shall also pay ten lakh rupees as punitive damages to my client',
      playbookRef: null,
    },
  ],
  options: [{ text: 'Pay within the window.', why: null, quote: null, playbookRef: 'cheque_bounce.opt.pay' }],
  doNow: [
    { text: 'Note when the notice reached you.', why: null, quote: null, playbookRef: 'cheque_bounce.pit.receipt' },
  ],
  deadlines: [
    {
      label: 'Pay Rs. 1,50,000',
      quote: 'within 15 days of receipt of this notice',
      kind: 'relative',
      date: null,
      days: 15,
      from: 'receipt',
    },
  ],
  notStated: [{ question: 'Which bank returned the cheque?', whyItMatters: 'You need it to check the return memo.' }],
  lawyerQuestions: ['Was this notice sent within 30 days of the return memo?'],
  ...over,
})

/** The on-screen results. jsdom loads no CSS, so the print-only brief copy would otherwise match queries too. */
const screenView = (): HTMLElement => document.querySelector('main .no-print') as HTMLElement

async function loadSampleAndDecode(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
  await user.click(screen.getByRole('button', { name: label }))
  await user.click(screen.getByRole('button', { name: 'Decode this notice' }))
}

beforeEach(() => createAiProvider.mockReturnValue(null))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('intake', () => {
  it('starts with an empty form, a disabled Decode button, and the disclaimer visible', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Decode this notice' })).toBeDisabled()
    expect(screen.getByText(/Information, not legal advice/)).toBeInTheDocument()
    expect(screen.getByText('AI off — rule-based mode')).toBeInTheDocument()
  })

  it('offers a skip link and labelled form controls', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main')
    expect(screen.getByLabelText('The text of your notice')).toBeInTheDocument()
    expect(screen.getByLabelText('Date you received it')).toBeInTheDocument()
    expect(screen.getByLabelText('Explain it in')).toBeInTheDocument()
  })

  it('fills the form when a sample is chosen, and enables Decode', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Cheque bounce notice/ }))
    expect((screen.getByLabelText('The text of your notice') as HTMLTextAreaElement).value).toContain('SECTION 138')
    expect(screen.getByRole('button', { name: 'Decode this notice' })).toBeEnabled()
  })

  it('shows an actionable error for text that is too short, and keeps what was typed', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('The text of your notice'), 'hello')
    await user.click(screen.getByRole('button', { name: 'Decode this notice' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/too short/i)
    expect(screen.getByLabelText('The text of your notice')).toHaveValue('hello')
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('switches between paste and upload with the arrow keys', async () => {
    const user = userEvent.setup()
    render(<App />)
    const paste = screen.getByRole('tab', { name: /Paste text/ })
    paste.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /Photo or PDF/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/Drop a photo or PDF/)).toBeVisible()
  })

  it('refuses a photo upload with a clear message when no AI is configured', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: /Photo or PDF/ }))
    const input = screen.getByLabelText('Choose a file', { selector: 'input' })
    await user.upload(input, new File(['x'], 'notice.png', { type: 'image/png' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/needs the AI/i)
  })

  it('rejects an unsupported file type', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<App />)
    await user.click(screen.getByRole('tab', { name: /Photo or PDF/ }))
    await user.upload(
      screen.getByLabelText('Choose a file', { selector: 'input' }),
      new File(['x'], 'run.exe', { type: 'application/x-msdownload' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(/photo|PDF|paste/i)
  })
})

describe('rule-based path (no AI configured)', () => {
  it('decodes a sample end to end and labels the reading as rule-based', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadSampleAndDecode(user, /Cheque bounce notice/)
    expect(await screen.findByRole('heading', { name: 'Cheque bounce (Section 138)' })).toBeInTheDocument()
    expect(screen.getByText(/Rule-based reading\./)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dates that matter' })).toBeInTheDocument()
    expect(screen.getAllByText('Verified quote').length).toBeGreaterThan(0)
    expect(screen.getAllByText('General information').length).toBeGreaterThan(0)
  })

  it('moves focus to the results heading and announces the outcome', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadSampleAndDecode(user, /Cheque bounce notice/)
    const heading = await screen.findByRole('heading', { name: 'Cheque bounce (Section 138)' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(screen.getAllByRole('status').some((n) => /Results ready/.test(n.textContent ?? ''))).toBe(true)
  })

  it('highlights the cited passage when "Show in notice" is used', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadSampleAndDecode(user, /Cheque bounce notice/)
    await screen.findByRole('heading', { name: 'Dates that matter' })
    const [first] = screen.getAllByRole('button', { name: 'Show in notice' })
    expect(first).toHaveAttribute('aria-pressed', 'false')
    await user.click(first)
    expect(first).toHaveAttribute('aria-pressed', 'true')
    const active = document.querySelector('mark[data-active="true"]')
    expect(active).not.toBeNull()
    expect(active?.textContent).toMatch(/\w/)
  })

  it('lets the person tick off the checklist and reports progress', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadSampleAndDecode(user, /Cheque bounce notice/)
    const panel = (await screen.findByRole('heading', { name: 'Do this now' })).closest('section')!
    expect(within(panel).getByText(/^0 of \d+ done$/)).toBeInTheDocument()
    await user.click(within(panel).getAllByRole('checkbox')[0])
    expect(within(panel).getByText(/^1 of \d+ done$/)).toBeInTheDocument()
  })

  it('shows the no-guidance note and no options for a notice outside the playbook', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadSampleAndDecode(user, /A notice with no playbook/)
    expect(await screen.findByText(/No curated guidance for this kind of notice/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your options' })).not.toBeInTheDocument()
    expect(
      within(screenView()).getByRole('heading', { name: "What the notice doesn't say", level: 3 }),
    ).toBeInTheDocument()
  })

  it('"Clear everything" wipes the result and the draft', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadSampleAndDecode(user, /Cheque bounce notice/)
    await screen.findByRole('heading', { name: 'Dates that matter' })
    await user.click(screen.getByRole('button', { name: /Clear everything/ }))
    expect(screen.getByLabelText('The text of your notice')).toHaveValue('')
    expect(screen.queryByRole('heading', { name: 'Dates that matter' })).not.toBeInTheDocument()
  })

  it('"Start over" returns to an empty intake', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadSampleAndDecode(user, /Cheque bounce notice/)
    await user.click(await screen.findByRole('button', { name: /Start over/ }))
    expect(screen.getByLabelText('The text of your notice')).toHaveValue('')
  })

  it('reports a copy failure instead of pretending it worked', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadSampleAndDecode(user, /Cheque bounce notice/)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    })
    await user.click(await screen.findByRole('button', { name: /Copy/ }))
    expect(await screen.findByText(/Could not copy/)).toBeInTheDocument()
  })
})

describe('AI path (mocked Gemini provider)', () => {
  it('shows verified findings and lists the invented claim under "removed"', async () => {
    createAiProvider.mockReturnValue(fakeProvider(chequePayload()))
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByText('AI: Gemini (API key)')).toBeInTheDocument()
    await loadSampleAndDecode(user, /Cheque bounce notice/)

    expect(await screen.findByText(/analysed by Gemini, checked by Cited/)).toBeInTheDocument()
    expect(screen.queryByText(/Rule-based reading\./)).not.toBeInTheDocument()
    const demands = screen.getByRole('heading', { name: 'What they want from you' }).closest('section')!
    expect(within(demands).getByText('Pay Rs. 1,50,000.')).toBeInTheDocument()
    // The fabricated "10 lakh" demand must not appear as a finding...
    expect(
      screen.queryByText('Also pay Rs. 10 lakh in damages.', { selector: 'p.font-medium' }),
    ).not.toBeInTheDocument()
    // ...but it is disclosed in the verification report.
    const summary = screen.getByText(/statements checked:/).closest('summary')!
    expect(summary).toHaveTextContent(/1 removed/)
    await userEvent.setup().click(summary)
    expect(screen.getByText(/Also pay Rs. 10 lakh in damages\./)).toBeInTheDocument()
    expect(screen.getByText(/Quote not found in the notice/)).toBeInTheDocument()
    // Model-listed NOT FOUND items are shown.
    const notFound = within(screenView())
      .getByRole('heading', { name: "What the notice doesn't say", level: 3 })
      .closest('section')!
    expect(within(notFound).getByText('Which bank returned the cheque?')).toBeInTheDocument()
  })

  it('falls back visibly when the AI returns unusable output twice', async () => {
    createAiProvider.mockReturnValue(fakeProvider(() => 'definitely not json'))
    const user = userEvent.setup()
    render(<App />)
    await loadSampleAndDecode(user, /Cheque bounce notice/)
    expect(await screen.findByText(/Rule-based reading\./)).toBeInTheDocument()
    expect(screen.getByText(/format the app could not use/)).toBeInTheDocument()
  })

  it('passes the chosen language to the model', async () => {
    let prompt = ''
    createAiProvider.mockReturnValue({
      name: 'gemini-api-key',
      generate: async (req) => {
        prompt = req.prompt
        return JSON.stringify(chequePayload())
      },
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Cheque bounce notice/ }))
    await user.selectOptions(screen.getByLabelText('Explain it in'), 'hi')
    await user.click(screen.getByRole('button', { name: 'Decode this notice' }))
    await screen.findByRole('heading', { name: 'Dates that matter' })
    expect(prompt).toMatch(/simple Hindi/)
  })

  it('ignores a slow response that arrives after the person cleared everything', async () => {
    let release: (v: string) => void = () => {}
    createAiProvider.mockReturnValue({
      name: 'gemini-api-key',
      generate: () =>
        new Promise<string>((r) => {
          release = r
        }),
    })
    const user = userEvent.setup()
    render(<App />)
    await loadSampleAndDecode(user, /Cheque bounce notice/)
    await user.click(await screen.findByRole('button', { name: /Clear everything/ }))
    release(JSON.stringify(chequePayload()))
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByLabelText('The text of your notice')).toHaveValue('')
    expect(screen.queryByRole('heading', { name: 'Dates that matter' })).not.toBeInTheDocument()
  })
})

describe('photo upload flow', () => {
  const TRANSCRIPT = buildSamples(todayIso())[0].text
  let created: ReturnType<typeof vi.fn>
  let revoked: ReturnType<typeof vi.fn>

  beforeEach(() => {
    created = vi.fn(() => 'blob:preview')
    revoked = vi.fn()
    URL.createObjectURL = created as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revoked as unknown as typeof URL.revokeObjectURL
  })

  const uploadPhoto = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('tab', { name: /Photo or PDF/ }))
    await user.upload(
      screen.getByLabelText('Choose a file', { selector: 'input' }),
      new File(['x'], 'notice.png', { type: 'image/png' }),
    )
  }

  it('reads the photo, lets the person correct the text, then analyses exactly the corrected text', async () => {
    const analysed: string[] = []
    createAiProvider.mockReturnValue({
      name: 'gemini-api-key',
      generate: async (req) => {
        if (!req.json) {
          expect(req.file).toMatchObject({ mimeType: 'image/png' })
          return TRANSCRIPT
        }
        analysed.push(req.prompt)
        return JSON.stringify(chequePayload())
      },
    })
    const user = userEvent.setup()
    render(<App />)
    await uploadPhoto(user)

    expect(await screen.findByRole('heading', { name: 'Check what we read' })).toBeInTheDocument()
    expect(screen.getByAltText(/The photo you uploaded: notice.png/)).toHaveAttribute('src', 'blob:preview')
    const box = screen.getByLabelText(/Text read from notice.png/) as HTMLTextAreaElement
    expect(box.value).toBe(TRANSCRIPT)

    await user.type(box, ' CORRECTED-BY-USER')
    await user.click(screen.getByRole('button', { name: 'Looks right — decode it' }))

    expect(await screen.findByRole('heading', { name: 'Dates that matter' })).toBeInTheDocument()
    expect(analysed).toHaveLength(1)
    expect(analysed[0]).toContain('CORRECTED-BY-USER')
    expect(screen.getByText(/analysed by Gemini, checked by Cited/)).toBeInTheDocument()
  })

  it('"Choose a different file" returns to intake and releases the preview image', async () => {
    createAiProvider.mockReturnValue(fakeProvider(() => TRANSCRIPT))
    const user = userEvent.setup()
    render(<App />)
    await uploadPhoto(user)
    await user.click(await screen.findByRole('button', { name: 'Choose a different file' }))
    expect(screen.getByLabelText('The text of your notice')).toBeInTheDocument()
    expect(revoked).toHaveBeenCalledWith('blob:preview')
  })

  it('returns to intake with a clear message when almost nothing could be read', async () => {
    createAiProvider.mockReturnValue(fakeProvider(() => '[illegible]'))
    const user = userEvent.setup()
    render(<App />)
    await uploadPhoto(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Almost nothing could be read/)
    expect(screen.getByLabelText('The text of your notice')).toBeInTheDocument()
  })

  it('accepts a .txt file directly into the paste box without calling the AI', async () => {
    const generate = vi.fn()
    createAiProvider.mockReturnValue({ name: 'gemini-api-key', generate })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: /Photo or PDF/ }))
    await user.upload(
      screen.getByLabelText('Choose a file', { selector: 'input' }),
      new File([TRANSCRIPT], 'notice.txt', { type: 'text/plain' }),
    )
    await waitFor(() =>
      expect((screen.getByLabelText('The text of your notice') as HTMLTextAreaElement).value).toBe(TRANSCRIPT),
    )
    expect(generate).not.toHaveBeenCalled()
  })
})

describe('MarkdownLite', () => {
  it('renders headings, lists, bold and italics', () => {
    render(<MarkdownLite text={'# Title\n\n- **Bold** item\n- _Italic_ item\n\n1. First\n2. Second'} />)
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByText('Bold').tagName).toBe('STRONG')
    expect(screen.getByText('Italic').tagName).toBe('EM')
  })

  it('never interprets notice text as HTML', () => {
    const evil = '- <img src=x onerror="window.__xss=1"> and <script>window.__xss=1</script>'
    const { container } = render(<MarkdownLite text={evil} />)
    expect(container.querySelector('img, script')).toBeNull()
    expect(container.textContent).toContain('<img src=x')
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined()
  })

  it('does not treat snake_case or stray underscores as italics', () => {
    render(<MarkdownLite text="See cheque_bounce.opt.pay and a_b_c" />)
    expect(document.querySelector('em')).toBeNull()
  })
})
