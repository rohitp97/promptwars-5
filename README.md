# Cited
### Every claim, with its source.

> Built for **PromptWars Virtual: AI for Legal Assistance & Access** (Hack2Skill × Google).
> Design rationale, JSON contract and judging alignment: [`DESIGN.md`](./DESIGN.md).

Someone gets a legal notice. They have a deadline they can't find and words they can't parse.
**Cited** tells them, in about a minute, *what it is, how urgent it is, and what to do today* —
and shows the exact words in the notice behind every point, checked by code.

## Why not just use a general-purpose AI assistant?

| A chat assistant | Cited |
|---|---|
| May paraphrase or invent a quote; you can't tell | Every quote is **checked against the notice text**; unverifiable claims are removed and counted |
| Does date maths in its head | Deadlines are **computed by tested code** from the wording + the date you received it |
| Mixes what the document says with what it "knows" | Every line is labelled **Verified quote / Approximate / General information / Not in your notice** |
| Quietly fills gaps | "**What the notice doesn't say**" is a first-class section |
| A wall of prose | Dates + `.ics` calendar, do-now checklist, printable lawyer brief |
| Guesses about unfamiliar notice types | Outside its curated types it says so and offers no options |

## What it does

1. **Input**: paste text, upload a photo/PDF, or try a bundled sample. Photos/PDFs are read by
   Gemini and shown back to you to **check and correct before anything is analysed**.
2. **Analysis**: one Gemini call (strict JSON, prompt-injection-hardened) → every claim verified →
   dates resolved in code → urgency derived in code.
3. **Output**: urgency banner · dates that matter (+ `.ics`) · what it is · what they want ·
   do-now checklist · options · what they say happens · what they claim · what the notice doesn't
   say · lawyer brief (copy / download / print) · the notice itself with cited passages highlighted.
4. **Works without AI**: if Gemini is unavailable, slow, or returns something unusable, a
   rule-based reader takes over, clearly labelled. Its claims go through the *same* verifier.

## How it maps to the brief

| The brief asks for | What Cited does | Where |
|---|---|---|
| Simplify complex legal documents | Plain-language "what this is / what they want / what they say happens", in English or Hindi | `lib/prompts.ts`, `components/Findings.tsx` |
| Highlight clauses, obligations, risks | Demands, deadlines, consequences and sender claims, each with its exact quote highlighted in the notice | `lib/verify.ts`, `components/SourceViewer.tsx` |
| Understand options and next steps | Options and a do-now checklist from a curated, dated playbook; statutory windows computed from the receipt date | `data/playbook.ts`, `lib/deadlines.ts` |
| Summaries, checklists, actionable outputs | Urgency banner, `.ics` calendar of deadlines, tick-off checklist, printable brief | `lib/ics.ts`, `lib/brief.ts` |
| Prepare information and questions for a lawyer | One-page brief: facts, dates, quotes, documents to bring, questions to ask | `lib/brief.ts` |
| **Trust: cite sources, admit missing information** (the organisers' emphasis) | Every claim is a verified quote, general guidance, or an explicit "not in your notice"; unverifiable claims are removed and listed | `lib/verify.ts`, `lib/analysis.ts` |
| Assist, don't replace, professional advice | Never recommends an outcome; standing disclaimer; points to free legal aid (NALSA 15100) | `components/Chrome.tsx`, `data/playbook.ts` |

**Deliberately not built:** free-form chat / Q&A over the document, and comparing two contracts.
Cited answers the questions a person with a notice actually has, up front and each with its source,
rather than offering a chat box. It analyses a single notice.

## Setup

```bash
npm install
cp .env.example .env      # then fill in (see below)
npm run dev
```

With **no** env vars the app still runs in rule-based mode (the header says so).

### Enabling Gemini — Firebase AI Logic (recommended, no key in the browser)

1. Create a Firebase project and add a **Web app**; copy its config into `.env`
   (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, …).
2. In the Firebase console open **AI Logic** (under *Build*), click *Get started*, and choose the
   **Gemini Developer API**. (Menu names shift occasionally; the docs are at
   firebase.google.com/docs/ai-logic.)
3. **App Check must be *Unenforced* for the Firebase AI Logic API** (console → App Check → APIs).
   The app doesn't send App Check tokens yet, so an *enforced* API rejects every request with
   `401 "Firebase App Check token is invalid"`. Changes can take up to ~15 minutes to apply.

### Local development with a plain Gemini key

Put `VITE_GEMINI_API_KEY` in `.env`. It is honoured by `npm run dev` only. **Production builds
compile it out** unless you set `VITE_ALLOW_CLIENT_KEY=true`, which would ship the key to every
visitor. This is deliberate: a stray key in a production `.env` must not end up in the bundle.

### Deploy (Firebase Hosting)

```bash
cp .firebaserc.example .firebaserc     # put your project id in it
npm run deploy                         # build + firebase deploy --only hosting
```

`firebase.json` sets a strict CSP and security headers. If the AI calls are blocked in the browser
console with a CSP error, add the host it names to `connect-src` there and in `index.html`.

## Scripts

| | |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | typecheck + production build |
| `npm test` | 360+ tests: logic, UI flows, axe accessibility, WCAG contrast (Vitest + Testing Library) |
| `npm run test:coverage` | coverage report for `src/lib` and `src/hooks` |
| `npm run lint` | oxlint |
| `npm run format` / `format:check` | Prettier (write / verify) over `src` |

## Trust layer in one paragraph

Gemini is asked for claims that each carry a **verbatim quote** and/or a **playbook reference**.
`lib/verify.ts` normalises the notice and each quote (case, spacing, punctuation, hyphenation,
Devanagari-safe), finds the quote by index-mapped substring search, and otherwise accepts an
*approximate* match when ≥ 85% of the quote's 4-grams sit close together (OCR noise). A quote that
fails **rejects the whole claim** — a valid playbook reference can't rescue it. Dates and day-counts
the model read out of a quote are re-read by rules and must agree, otherwise no date is shown.
Notice type and playbook IDs are validated against the built-in playbook. Removed claims are listed
in the UI with the reason.

## Privacy

Nothing is stored server-side, and there is no database. Case state lives in memory; **Clear
everything** wipes it (including the photo preview). In AI mode the notice text (or photo) is sent
to Google's Gemini model to be read; in rule-based mode nothing leaves the browser.

## Known limitations (read before relying on it)

- **A verified quote proves the words are in your notice, not that the plain-language summary
  beside it is faithful.** That is why the quote is always shown right next to the claim.
- The **playbook** (5 India notice types) was drafted by the app's author, not a lawyer. It is
  labelled general information, dated, and gives statute references to check. Laws and state rules
  change.
- Notice text is sent to Gemini. Don't use it on notices you aren't comfortable sharing with
  Google's API terms.
- With App Check unenforced (required today, see Setup), anyone with the public Firebase web config
  could call the AI endpoint on your project's quota. Adding App Check tokens to the app and then
  enforcing is the known next step.
- Google retires and overloads Gemini models without notice (`gemini-2.5-flash` is already gone for
  new projects). The app tries a chain of models (`VITE_GEMINI_MODEL`, comma-separated, overrides the
  default), remembers the one that worked, and falls back to the rule-based reading if all fail.
- India-focused. Not tested with notices in languages other than English and Hindi. With "Explain
  in Hindi", the built-in statutory-timeline labels stay English.
- Gemini is non-deterministic: two runs on the same notice can differ slightly (e.g. how many
  claims it splits a point into). The verified/removed counts can therefore vary run to run.
- Live-tested through **Firebase AI Logic** on a fresh project (see DESIGN.md §12): text, Hindi,
  photo OCR, injection, failover, and total-overload fallback. Not yet tested: the deployed Firebase
  Hosting headers (CSP), App Check with tokens, and multi-page scanned PDFs.
- Cited is **information, not legal advice**.

## Pre-submission checklist

- [ ] `npm test`, `npm run build` and `npm run lint` are green
- [ ] Deployed link opens with no console errors
- [ ] Every bundled sample decodes (cheque, Hindi cheque, eviction, bank, "no playbook")
- [ ] A real photo of a notice → transcript check → results
- [ ] Empty / too-short / oversize / wrong-file-type inputs give a clear message
- [ ] Header shows **AI: Gemini via Firebase** (not "rule-based mode") on the deployed site
- [ ] No Gemini key in the bundle. Your **Firebase** web key (also starts with `AIza`) is expected and
      public; the *Gemini* key from `.env` must not appear in `dist/` (and there should be no `genai` chunk)
- [ ] Demo video recorded (click-through, ~60–90 s: see DESIGN.md §11)

## Structure

```
src/
├── lib/        verify · dates · deadlines · urgency · extract · fallback · analysis · pipeline
│               prompts · validation · ai · ics · brief · segments · file   (pure, tested)
├── data/       playbook · samples
├── hooks/      useCase
├── components/ Intake · TranscriptReview · Results · Findings · SourceViewer · …
└── __tests__/  360+ tests
```
