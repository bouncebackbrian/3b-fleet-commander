/**
 * taxTips.ts — rotating one-line awareness tips shown to 1099 drivers on
 * their weekly pay (2026-07-30). Deliberately general and non-prescriptive —
 * this is not tax advice, just prompts to think about things a tax
 * professional can confirm apply to their situation. Pure/tested.
 */

export const TAX_TIPS: string[] = [
  'Fuel, tolls, and truck maintenance are commonly deductible business expenses for owner-operators — keep every receipt.',
  'Many 1099 drivers set aside 25–30% of gross pay for federal + self-employment tax, but the right number depends on your full year of income.',
  'Quarterly estimated tax payments (Form 1040-ES) can help you avoid an underpayment penalty at filing time.',
  'A separate bank account for business income/expenses makes tax time (and mileage/expense tracking) much easier.',
  'Per-diem and lodging costs for overnight runs may be deductible — check with a tax professional on current rates.',
  'Truck depreciation, lease payments, and equipment purchases can often be deducted or expensed.',
  'Health insurance premiums may be deductible for self-employed drivers — worth asking your tax preparer.',
  'Keep a mileage log — the standard mileage rate or actual vehicle expenses can both lower your taxable income.',
  'A qualified retirement account (SEP-IRA, Solo 401(k)) can reduce this year\'s taxable income while building savings.',
  'None of this is tax advice — a CPA or enrolled agent familiar with owner-operators can tell you what actually applies to you.',
]

/** Deterministic pick so the same day shows the same tip (not a jarring reshuffle on every page load). */
export function tipOfTheDay(date: Date = new Date()): string {
  const dayIndex = Math.floor(date.getTime() / (24 * 60 * 60 * 1000))
  return TAX_TIPS[dayIndex % TAX_TIPS.length]
}
