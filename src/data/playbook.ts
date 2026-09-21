import type { NoticeType, NoticeTypeId } from '../types'

/**
 * Curated, dated general information for the most common legal notices an individual in India
 * receives. It is deliberately small: the model may only reference items by ID, and anything not
 * listed here is reported as "no curated guidance" instead of being improvised.
 *
 * Limitation (stated in the UI and README): drafted by the app's author, not a lawyer. Statute
 * references are given so users can check them. Laws and state rules change.
 */
export const PLAYBOOK_REVIEWED_ON = '2026-09-21'

export interface PlaybookItem {
  id: string
  /** Short label, shown on the PLAYBOOK badge. */
  label: string
  text: string
}

export interface PlaybookTimeline {
  id: string
  label: string
  /** receipt → date the user received the notice; previous → the prior timeline's date; event → not computable. */
  anchor: 'receipt' | 'previous' | 'event'
  offset?: { days?: number; months?: number }
  statuteRef: string
  note: string
}

export interface PlaybookSignal {
  term: string
  weight: number
}

export interface PlaybookEntry {
  id: NoticeTypeId
  title: string
  summary: string
  authority: string[]
  signals: PlaybookSignal[]
  timelines: PlaybookTimeline[]
  options: PlaybookItem[]
  pitfalls: PlaybookItem[]
  documents: PlaybookItem[]
  lawyerQuestions: string[]
}

export const PLAYBOOK: readonly PlaybookEntry[] = [
  {
    id: 'cheque_bounce',
    title: 'Cheque bounce (Section 138)',
    summary:
      'A demand notice after a cheque was returned unpaid. The law gives the drawer 15 days from receiving the notice to pay before a criminal complaint becomes possible.',
    authority: ['Negotiable Instruments Act, 1881, ss.138–143A'],
    signals: [
      { term: 'section 138', weight: 4 },
      { term: 'negotiable instruments', weight: 4 },
      { term: 'dishonour', weight: 3 },
      { term: 'return memo', weight: 3 },
      { term: 'insufficient funds', weight: 3 },
      { term: 'cheque', weight: 2 },
      { term: 'drawer', weight: 1 },
      { term: 'payee', weight: 1 },
      { term: 'धारा 138', weight: 4 },
      { term: 'चेक', weight: 2 },
    ],
    timelines: [
      {
        id: 'cheque_bounce.tl.pay',
        label: 'Last day to pay the cheque amount (15 days after receiving the notice)',
        anchor: 'receipt',
        offset: { days: 15 },
        statuteRef: 'NI Act s.138(c)',
        note: 'If the amount is not paid within 15 days of receiving the notice, the payee may file a criminal complaint.',
      },
      {
        id: 'cheque_bounce.tl.complain',
        label: 'Payee can file a complaint until (one month after the payment window ends)',
        anchor: 'previous',
        offset: { months: 1 },
        statuteRef: 'NI Act s.142(1)(b)',
        note: 'A court may condone delay for sufficient cause.',
      },
    ],
    options: [
      {
        id: 'cheque_bounce.opt.pay',
        label: 'Pay within the window',
        text: 'Paying the full amount within 15 days of receiving the notice means the s.138 offence is not made out. Keep proof of payment.',
      },
      {
        id: 'cheque_bounce.opt.reply',
        label: 'Send a written reply',
        text: 'If you dispute the debt, or say the cheque was not for a legally enforceable liability, a written reply (ideally through a lawyer) puts your position on record. A reply does not stop the 15 days from running.',
      },
      {
        id: 'cheque_bounce.opt.settle',
        label: 'Negotiate a settlement',
        text: 'These cases can be settled (compounded), including after a complaint is filed, usually with the court\'s permission and sometimes costs. Get any settlement in writing.',
      },
    ],
    pitfalls: [
      {
        id: 'cheque_bounce.pit.ignore',
        label: 'Ignoring the notice',
        text: 'The 15 days run from receipt whether or not you reply. Silence does not pause the clock.',
      },
      {
        id: 'cheque_bounce.pit.receipt',
        label: 'Date of receipt matters',
        text: 'Note when the notice actually reached you (courier/postal receipt). The payment window is counted from that date.',
      },
    ],
    documents: [
      { id: 'cheque_bounce.doc.cheque', label: 'Cheque and return memo', text: 'A copy of the cheque and the bank\'s return memo' },
      { id: 'cheque_bounce.doc.notice', label: 'Notice and delivery proof', text: 'The notice plus the envelope or courier receipt showing when it reached you' },
      { id: 'cheque_bounce.doc.txn', label: 'Underlying transaction', text: 'Records of the underlying deal: invoice, agreement, messages' },
      { id: 'cheque_bounce.doc.paid', label: 'Payments made', text: 'Proof of any payments already made' },
    ],
    lawyerQuestions: [
      'Was the cheque presented within its validity period, and was this notice sent within 30 days of the bank\'s return memo?',
      'Do I have a defence that there was no legally enforceable debt or liability?',
      'Given the amount and my records, should I pay, reply, or negotiate a settlement?',
    ],
  },
  {
    id: 'eviction_rent',
    title: 'Rent / eviction notice',
    summary:
      'A landlord asking a tenant to vacate or pay arrears. Rules depend heavily on the state Rent Control Act and on the written agreement.',
    authority: ['Transfer of Property Act, 1882, s.106', 'State Rent Control Acts (vary by state)'],
    signals: [
      { term: 'vacate', weight: 3 },
      { term: 'eviction', weight: 3 },
      { term: 'notice to quit', weight: 3 },
      { term: 'terminate the tenancy', weight: 3 },
      { term: 'tenancy', weight: 2 },
      { term: 'landlord', weight: 2 },
      { term: 'tenant', weight: 2 },
      { term: 'rent arrears', weight: 2 },
      { term: 'premises', weight: 1 },
      { term: 'किराया', weight: 1 },
      { term: 'खाली', weight: 2 },
    ],
    timelines: [
      {
        id: 'eviction_rent.tl.minimum',
        label: 'Minimum notice for a month-to-month tenancy is 15 days, ending with a tenancy month',
        anchor: 'event',
        statuteRef: 'Transfer of Property Act s.106',
        note: 'Your written agreement or state rent law may require longer. The end date depends on your tenancy months, so this app does not compute it.',
      },
    ],
    options: [
      {
        id: 'eviction_rent.opt.cure',
        label: 'Clear arrears, with proof',
        text: 'If the notice is about unpaid rent, paying what is genuinely owed (and keeping proof) may resolve it. Some state laws give tenants a stated period to do this.',
      },
      {
        id: 'eviction_rent.opt.reply',
        label: 'Send a written reply',
        text: 'Correct the record in writing if the facts are wrong: rent already paid, notice period too short, or a reason your state law does not recognise.',
      },
      {
        id: 'eviction_rent.opt.negotiate',
        label: 'Negotiate an exit date',
        text: 'Ask for a written extension or exit date and for the return of your security deposit.',
      },
      {
        id: 'eviction_rent.opt.process',
        label: 'Eviction generally needs due process',
        text: 'A landlord generally needs a court order to remove a tenant by force. Lock-outs and cutting utilities are unlawful in most situations. Confirm with a lawyer for your state.',
      },
    ],
    pitfalls: [
      { id: 'eviction_rent.pit.sign', label: 'Signing under pressure', text: 'Do not sign a "voluntary surrender" or a new agreement without reading it and taking advice.' },
      { id: 'eviction_rent.pit.offset', label: 'Withholding rent', text: 'Do not stop paying rent to "adjust" against the deposit unless your agreement says so.' },
      { id: 'eviction_rent.pit.verbal', label: 'Verbal promises', text: 'Get every promise, extension and settlement in writing.' },
    ],
    documents: [
      { id: 'eviction_rent.doc.agreement', label: 'Rent agreement', text: 'The signed rent or leave-and-licence agreement' },
      { id: 'eviction_rent.doc.receipts', label: 'Rent proof', text: 'Rent receipts and bank statements showing payments' },
      { id: 'eviction_rent.doc.deposit', label: 'Deposit proof', text: 'Proof of the security deposit paid' },
      { id: 'eviction_rent.doc.messages', label: 'Messages', text: 'Messages and emails with the landlord' },
    ],
    lawyerQuestions: [
      'Which state\'s rent control law governs my tenancy, and does it protect me?',
      'Is the notice period in this notice valid under my agreement and state law?',
      'What is the safest way to make sure I get my security deposit back?',
    ],
  },
  {
    id: 'loan_recovery',
    title: 'Bank loan recovery (SARFAESI)',
    summary:
      'A bank demanding repayment of a secured loan. Under SARFAESI s.13(2) the borrower normally gets 60 days before the bank can act on the security.',
    authority: ['SARFAESI Act, 2002, ss.13, 17', 'Recovery of Debts and Bankruptcy Act, 1993'],
    signals: [
      { term: 'sarfaesi', weight: 4 },
      { term: 'section 13(2)', weight: 4 },
      { term: 'non-performing asset', weight: 3 },
      { term: 'npa', weight: 2 },
      { term: 'secured asset', weight: 3 },
      { term: 'secured creditor', weight: 3 },
      { term: 'outstanding dues', weight: 2 },
      { term: 'loan account', weight: 2 },
      { term: 'possession', weight: 1 },
      { term: 'mortgage', weight: 1 },
      { term: 'hypothecat', weight: 1 },
    ],
    timelines: [
      {
        id: 'loan_recovery.tl.sixty',
        label: 'Repay or object within 60 days of receiving the notice',
        anchor: 'receipt',
        offset: { days: 60 },
        statuteRef: 'SARFAESI Act s.13(2)',
        note: 'After 60 days the bank may take steps against the secured asset.',
      },
      {
        id: 'loan_recovery.tl.drt',
        label: 'Application to the Debts Recovery Tribunal: generally within 45 days of the bank\'s enforcement step',
        anchor: 'event',
        statuteRef: 'SARFAESI Act s.17',
        note: 'Counted from the bank\'s action, not from this notice, so no date is computed.',
      },
    ],
    options: [
      {
        id: 'loan_recovery.opt.object',
        label: 'Submit written objections',
        text: 'Within the 60-day period you can send reasoned objections. The bank is expected to consider them and communicate its reasons if it does not accept them (s.13(3A)).',
      },
      {
        id: 'loan_recovery.opt.ots',
        label: 'Ask about settlement or restructuring',
        text: 'Ask the bank in writing about a one-time settlement (OTS) or restructuring of the loan.',
      },
      {
        id: 'loan_recovery.opt.drt',
        label: 'Challenge before the DRT',
        text: 'If the bank acts on the secured asset, you can apply to the Debts Recovery Tribunal under s.17, generally within 45 days.',
      },
    ],
    pitfalls: [
      { id: 'loan_recovery.pit.ignore', label: 'Ignoring the notice', text: 'After the 60 days the bank can take possession of and sell secured assets.' },
      { id: 'loan_recovery.pit.transfer', label: 'Selling the secured asset', text: 'After receiving the notice, do not sell, lease or transfer the secured asset without the bank\'s written consent (s.13(13)).' },
    ],
    documents: [
      { id: 'loan_recovery.doc.agreement', label: 'Loan documents', text: 'Loan agreement and sanction letter' },
      { id: 'loan_recovery.doc.statement', label: 'Statement of account', text: 'Statement of account and all repayment receipts' },
      { id: 'loan_recovery.doc.letters', label: 'Correspondence', text: 'All letters and emails exchanged with the bank' },
    ],
    lawyerQuestions: [
      'Is this notice valid, and was the account classified as an NPA correctly?',
      'Can the bank\'s calculation of the dues be challenged?',
      'Would a one-time settlement or restructuring make sense here?',
    ],
  },
  {
    id: 'employment_dispute',
    title: 'Employment / termination notice',
    summary:
      'A notice from an employer about termination, notice period, bond recovery or breach. Your written contract drives most of the answers.',
    authority: ['Your appointment letter / employment contract', 'Industrial Disputes Act, 1947 (for "workmen")', 'State Shops & Establishments Acts'],
    signals: [
      { term: 'termination', weight: 3 },
      { term: 'terminated', weight: 3 },
      { term: 'appointment letter', weight: 3 },
      { term: 'notice period', weight: 2 },
      { term: 'full and final', weight: 3 },
      { term: 'non-compete', weight: 3 },
      { term: 'employer', weight: 1 },
      { term: 'employee', weight: 1 },
      { term: 'employment', weight: 1 },
      { term: 'bond', weight: 1 },
      { term: 'absconding', weight: 2 },
    ],
    timelines: [
      {
        id: 'employment_dispute.tl.contract',
        label: 'Notice periods and deadlines are set by your contract',
        anchor: 'event',
        statuteRef: 'Your employment contract',
        note: 'This app cannot compute them without reading your contract.',
      },
    ],
    options: [
      {
        id: 'employment_dispute.opt.read',
        label: 'Check your contract',
        text: 'Read your appointment letter for the notice period and any bond, clawback or non-compete terms. Enforceability of these varies.',
      },
      {
        id: 'employment_dispute.opt.reply',
        label: 'Reply in writing',
        text: 'Correct the facts in writing: dates of service, dues owed, and the reasons stated.',
      },
      {
        id: 'employment_dispute.opt.settle',
        label: 'Negotiate full-and-final terms',
        text: 'Before signing any release, check the settlement lists salary, leave encashment, PF and gratuity that apply to you.',
      },
    ],
    pitfalls: [
      { id: 'employment_dispute.pit.sign', label: 'Signing under pressure', text: 'Do not sign a resignation letter or settlement release you have not read.' },
      { id: 'employment_dispute.pit.records', label: 'Losing records', text: 'Save your emails, payslips and letters before you lose account access.' },
    ],
    documents: [
      { id: 'employment_dispute.doc.letter', label: 'Appointment letter', text: 'Appointment letter and any amendments' },
      { id: 'employment_dispute.doc.payslips', label: 'Payslips and PF', text: 'Payslips and PF statements' },
      { id: 'employment_dispute.doc.emails', label: 'Emails', text: 'Relevant emails with the employer' },
    ],
    lawyerQuestions: [
      'Is the termination valid under my contract and the applicable law?',
      'Are the bond or non-compete clauses enforceable?',
      'Which dues (salary, gratuity, PF) am I owed?',
    ],
  },
  {
    id: 'consumer_demand',
    title: 'Consumer / refund demand',
    summary:
      'A demand notice about a refund, defective product or deficient service. Complaints go to the Consumer Commission within a limitation period.',
    authority: ['Consumer Protection Act, 2019'],
    signals: [
      { term: 'consumer protection act', weight: 4 },
      { term: 'consumer commission', weight: 3 },
      { term: 'deficiency in service', weight: 3 },
      { term: 'unfair trade practice', weight: 3 },
      { term: 'refund', weight: 2 },
      { term: 'defective', weight: 2 },
      { term: 'warranty', weight: 1 },
      { term: 'compensation', weight: 1 },
    ],
    timelines: [
      {
        id: 'consumer_demand.tl.limit',
        label: 'A consumer complaint is generally filed within 2 years of the cause of action',
        anchor: 'event',
        statuteRef: 'Consumer Protection Act s.69',
        note: 'Counted from when the problem arose, which this app cannot infer.',
      },
    ],
    options: [
      { id: 'consumer_demand.opt.respond', label: 'Respond in writing', text: 'Reply in writing accepting or refusing the refund or repair, with reasons and dates.' },
      { id: 'consumer_demand.opt.mediate', label: 'Consider mediation', text: 'The Act encourages mediation; a documented settlement can avoid a complaint.' },
    ],
    pitfalls: [
      { id: 'consumer_demand.pit.ignore', label: 'Ignoring the notice', text: 'Ignoring it can lead to a complaint before the Consumer Commission where you would have to defend.' },
    ],
    documents: [
      { id: 'consumer_demand.doc.invoice', label: 'Invoice', text: 'Invoice or bill and any warranty card' },
      { id: 'consumer_demand.doc.messages', label: 'Correspondence', text: 'Emails, chats and call records with the other side' },
      { id: 'consumer_demand.doc.photos', label: 'Photos', text: 'Photos or videos of the defect' },
    ],
    lawyerQuestions: [
      'Does the claim have merit given the invoice and warranty?',
      'What is a fair refund or settlement figure?',
      'Is a written reply enough, or should I expect a Consumer Commission complaint?',
    ],
  },
]

/**
 * Steps that are sensible for ANY legal notice, including ones outside the curated types. They are
 * deliberately procedural (record dates, keep documents, get advice) rather than legal conclusions,
 * so an unfamiliar notice still gets sourced next steps without the app improvising law.
 */
export const GENERAL_GUIDANCE: readonly PlaybookItem[] = [
  {
    id: 'general.do.receipt',
    label: 'Record when it reached you',
    text: 'Write down the date and how the notice reached you (post, courier, email or WhatsApp) and keep the envelope or message. Many time limits count from the day you received it.',
  },
  {
    id: 'general.do.read',
    label: 'Read all of it',
    text: 'Read the whole notice, including anything attached or on the back, and note every date, amount and name in it.',
  },
  {
    id: 'general.do.keep',
    label: 'Keep every document',
    text: 'Keep the original notice and every related document (agreements, receipts, messages, photos). Do not throw away, edit or "tidy up" anything.',
  },
  {
    id: 'general.do.pause',
    label: 'Understand before acting',
    text: 'Avoid paying, signing or replying until you understand what is being asked and, if it matters, have taken advice. Also avoid ignoring it: a time limit may be running.',
  },
  {
    id: 'general.do.lawyer',
    label: 'Talk to a lawyer',
    text: 'Speak to a lawyer about anything involving a deadline or money. If cost is a worry, State Legal Services Authorities offer free legal aid to eligible people (NALSA helpline: 15100).',
  },
]

export const NOTICE_TYPE_IDS: readonly NoticeTypeId[] = PLAYBOOK.map((e) => e.id)

export function getPlaybookEntry(type: NoticeType): PlaybookEntry | null {
  return PLAYBOOK.find((e) => e.id === type) ?? null
}

export function isNoticeTypeId(value: string): value is NoticeTypeId {
  return NOTICE_TYPE_IDS.some((id) => id === value)
}

/**
 * Every referenceable id → the label shown on the PLAYBOOK badge. General guidance is always
 * referenceable; type-specific items only for the detected notice type (a cheque-bounce ref on an
 * eviction notice is rejected).
 */
export function buildRefIndex(entry: PlaybookEntry | null): Map<string, string> {
  const index = new Map<string, string>()
  for (const item of GENERAL_GUIDANCE) index.set(item.id, `General guidance · ${item.label}`)
  if (!entry) return index
  const prefix = `${entry.title} playbook`
  for (const item of [...entry.options, ...entry.pitfalls, ...entry.documents]) {
    index.set(item.id, `${prefix} · ${item.label}`)
  }
  for (const tl of entry.timelines) {
    index.set(tl.id, `${prefix} · ${tl.statuteRef}`)
  }
  return index
}
