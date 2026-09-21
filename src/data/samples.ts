import { addDays, formatLong } from '../lib/dates'
import type { IsoDate } from '../types'

export interface Sample {
  id: string
  label: string
  blurb: string
  text: string
  /** BCP-47 tag for the sample's language when it is not English, so screen readers pronounce it correctly. */
  lang?: string
  /** How many days before `today` the sample notice reached the recipient. */
  receivedDaysAgo: number
}

const dmy = (iso: IsoDate): string => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/**
 * Sample notices are built around today's date so a demo never shows a stale deadline.
 * They are fictional and say so. They are only *inputs*: every result is produced live by the
 * same pipeline as a pasted notice.
 */
export function buildSamples(today: IsoDate): Sample[] {
  const dated = addDays(today, -4)
  const chequeDate = addDays(today, -40)
  const bounceDate = addDays(today, -22)
  const vacateBy = addDays(today, 30)

  return [
    {
      id: 'cheque',
      label: 'Cheque bounce notice',
      blurb: 'Section 138 demand — 15-day window',
      receivedDaysAgo: 2,
      text: `SAMPLE — fictional notice for demonstration

Date: ${formatLong(dated)}

REGISTERED POST A.D.

LEGAL NOTICE UNDER SECTION 138 OF THE NEGOTIABLE INSTRUMENTS ACT, 1881

To,
Mr. Rahul Menon,
14, Lake View Apartments, Bengaluru 560001

Under instructions from my client, Ms. Priya Iyer, I hereby serve you with the following notice.

1. That you issued cheque no. 004512 dated ${formatLong(chequeDate)} for Rs. 1,50,000/- drawn on Sample Bank, MG Road Branch, in favour of my client towards repayment of a friendly loan.

2. That the said cheque was presented for encashment and was returned unpaid on ${formatLong(bounceDate)} with the remark "Funds Insufficient", as per the bank's return memo.

3. That you are hereby called upon to pay the said sum of Rs. 1,50,000/- to my client within 15 days of receipt of this notice, failing which my client shall be constrained to initiate criminal proceedings against you under Section 138 of the Negotiable Instruments Act, 1881, at your risk as to costs and consequences.

Yours faithfully,
Adv. S. Nair, Advocate for Ms. Priya Iyer`,
    },
    {
      id: 'cheque-hi',
      lang: 'hi',
      label: 'चेक बाउंस नोटिस (हिन्दी)',
      blurb: 'The same kind of notice, written in Hindi',
      receivedDaysAgo: 1,
      text: `नमूना — प्रदर्शन हेतु काल्पनिक नोटिस

दिनांक: ${dmy(dated)}

विषय: परक्राम्य लिखत अधिनियम, 1881 की धारा 138 के अंतर्गत विधिक नोटिस

श्री सुरेश वर्मा,
23, गांधी नगर, जयपुर

मेरी मुवक्किल श्रीमती अनीता शर्मा के निर्देश पर आपको यह नोटिस दिया जाता है।

1. आपने दिनांक ${dmy(chequeDate)} को ₹75,000/- का चेक संख्या 118834 जारी किया था।

2. उक्त चेक दिनांक ${dmy(bounceDate)} को "अपर्याप्त निधि" के कारण बैंक द्वारा अनादरित कर दिया गया।

3. अतः आपको इस नोटिस की प्राप्ति के 15 दिनों के भीतर उक्त राशि का भुगतान करने के लिए कहा जाता है, अन्यथा आपके विरुद्ध धारा 138 के अंतर्गत आपराधिक कार्यवाही की जाएगी।

अधिवक्ता आर. गुप्ता`,
    },
    {
      id: 'rent',
      label: 'Eviction notice',
      blurb: 'Landlord asks you to vacate by a date',
      receivedDaysAgo: 3,
      text: `SAMPLE — fictional notice for demonstration

Date: ${formatLong(dated)}

NOTICE TO QUIT

To,
Ms. Kavita Rao (Tenant),
Flat 5B, Green Park Residency, Pune

From: Mr. Anil Deshpande (Landlord)

Sir/Madam,

You are a monthly tenant of the above premises at a rent of Rs. 22,000 per month. You have not paid rent for the last three months, and the arrears stand at Rs. 66,000.

I hereby terminate your tenancy and require you to vacate the premises and hand over peaceful possession on or before ${formatLong(vacateBy)}.

If you fail to do so, I shall be compelled to take legal proceedings for eviction and recovery of arrears and damages at your cost.

Anil Deshpande`,
    },
    {
      id: 'bank',
      label: 'Bank recovery notice',
      blurb: 'SARFAESI demand — 60-day period',
      receivedDaysAgo: 5,
      text: `SAMPLE — fictional notice for demonstration

Date: ${formatLong(dated)}

DEMAND NOTICE UNDER SECTION 13(2) OF THE SARFAESI ACT, 2002

To,
Mr. Vikram Shah (Borrower)
Loan Account No. HL-77120345

Your loan account has been classified as a Non-Performing Asset. The outstanding dues as on the date of this notice are Rs. 18,40,250/- together with further interest.

You are called upon to discharge your liabilities in full within 60 days from the date of receipt of this notice, failing which the Bank will exercise its rights under Section 13(4) of the Act to take possession of the secured asset, being the residential flat mortgaged to the Bank.

You are restrained from transferring the secured asset by sale, lease or otherwise without the Bank's prior written consent.

Authorised Officer, Sample Bank`,
    },
    {
      id: 'other',
      label: 'A notice with no playbook',
      blurb: 'Shows how the app behaves outside its curated types',
      receivedDaysAgo: 1,
      text: `SAMPLE — fictional notice for demonstration

Date: ${formatLong(dated)}

CEASE AND DESIST NOTICE

To,
Ms. Neha Kulkarni, proprietor of "Neha's Bakes"

Our client, Studio Lumen, owns the copyright in the photograph titled "Monsoon Bread". We have noticed that the photograph appears on your website and Instagram page without a licence.

You are called upon to remove the photograph from all platforms within 7 days of receipt of this notice and to confirm removal in writing. Our client also reserves the right to claim damages for the period of unauthorised use.

Advocates for Studio Lumen`,
    },
  ]
}
