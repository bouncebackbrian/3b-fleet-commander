/**
 * hectorReport.ts — builds the plain-text issue report a driver copies and
 * texts to ownership (Hector/Brian) when dispatching despite an open
 * safety-critical/out-of-service defect that the app itself won't clear.
 *
 * Pure and tested like the rest of src/lib/dumpTruck — no React, no fetch.
 */

import { defectCategory } from './defectCategory'

export interface HectorReportDefect {
  description: string
  severity: string
}

export interface HectorReportInput {
  truckUnitNumber: string | null
  driverName: string | null
  fuelLevel: string
  defects: HectorReportDefect[]
  note?: string
  now?: Date
}

const SEVERITY_LABEL: Record<string, string> = {
  safety_critical: 'SAFETY CRITICAL',
  out_of_service: 'OUT OF SERVICE',
}

const SEVERITY_RANK: Record<string, number> = {
  monitor: 0,
  non_safety: 1,
  safety_critical: 2,
  out_of_service: 3,
}

/** Repeated pretrip inspections re-log the same physical issue as a new row
 *  every time ("Windshield chips or cracks — Cracked windshield", "Windshield
 *  and mirrors — Crack on passenger side", etc.), so exact-text matching
 *  barely dedupes. Item labels follow "Category — detail"; group by the
 *  category so all worded variants of the same physical issue collapse to
 *  one line, keeping the highest-severity instance seen for that category. */
function dedupeDescriptions(defects: HectorReportDefect[]): HectorReportDefect[] {
  const seen = new Map<string, HectorReportDefect>()
  for (const d of defects) {
    const category = defectCategory(d.description)
    const existing = seen.get(category)
    if (!existing || (SEVERITY_RANK[d.severity] ?? 0) > (SEVERITY_RANK[existing.severity] ?? 0)) {
      seen.set(category, d)
    }
  }
  return [...seen.values()]
}

export function buildHectorReport(input: HectorReportInput): string {
  const now = input.now ?? new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const truck = input.truckUnitNumber ? `Truck ${input.truckUnitNumber}` : 'Truck (unit unknown)'
  const distinctDefects = dedupeDescriptions(input.defects)

  const lines: string[] = []
  lines.push(`Cal-Neva ${truck} — ${dateStr}`)
  lines.push(`Fuel: ${input.fuelLevel || 'not reported'}`)
  lines.push('')
  if (distinctDefects.length) {
    lines.push('Open issue(s):')
    for (const d of distinctDefects) {
      const tag = SEVERITY_LABEL[d.severity]
      lines.push(`- ${d.description}${tag ? ` [${tag}]` : ''}`)
    }
  } else {
    lines.push('No open safety-critical issues on file.')
  }
  if (input.note?.trim()) {
    lines.push('')
    lines.push(input.note.trim())
  }
  lines.push('')
  lines.push('Continuing to work today — please advise if truck needs to come in.')
  lines.push(`— ${input.driverName ?? 'Driver'}`)

  return lines.join('\n')
}
