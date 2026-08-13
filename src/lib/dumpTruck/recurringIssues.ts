import { defectCategory } from './defectCategory'
import type { DefectSeverity } from './types'

export interface RecurringIssueDefect {
  id: string
  truckId: string
  description: string
  severity: DefectSeverity
  status: string
  createdAt: string
  reportedBy: string | null
}

export interface RecurringIssueGroup {
  category: string
  /** How many times this category has been logged, across all trucks and statuses. */
  totalCount: number
  openCount: number
  highestSeverity: DefectSeverity
  truckIds: string[]
  /** Driver user IDs who reported an instance of this category (nulls dropped). */
  reportedByIds: string[]
  firstSeenAt: string
  lastSeenAt: string
  /** Most recent description logged for this category, for display. */
  sampleDescription: string
}

/** A category counts as a "team" issue — not one truck's or one driver's problem — once
 *  it's shown up on more than one truck or been reported by more than one driver. */
export function isTeamIssue(group: RecurringIssueGroup): boolean {
  return group.truckIds.length > 1 || group.reportedByIds.length > 1
}

const SEVERITY_RANK: Record<DefectSeverity, number> = {
  monitor: 0,
  non_safety: 1,
  safety_critical: 2,
  out_of_service: 3,
}

const OPEN_STATUSES = new Set(['open', 'acknowledged'])

/**
 * Pareto view of defect data: how often has each physical issue (grouped by
 * "Category — detail" prefix, see defectCategory.ts) been logged, on how
 * many trucks, and is it still open. Sorted by total occurrences descending
 * so the issues worth a corrective action bubble to the top.
 */
export function groupRecurringIssues(defects: RecurringIssueDefect[]): RecurringIssueGroup[] {
  const byCategory = new Map<string, RecurringIssueDefect[]>()
  for (const d of defects) {
    const category = defectCategory(d.description)
    const list = byCategory.get(category) ?? []
    list.push(d)
    byCategory.set(category, list)
  }

  const groups: RecurringIssueGroup[] = [...byCategory.entries()].map(([category, items]) => {
    const sorted = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const oldest = sorted[sorted.length - 1]
    const newest = sorted[0]
    return {
      category,
      totalCount: items.length,
      openCount: items.filter(d => OPEN_STATUSES.has(d.status)).length,
      highestSeverity: items.reduce<DefectSeverity>(
        (max, d) => (SEVERITY_RANK[d.severity] > SEVERITY_RANK[max] ? d.severity : max),
        'monitor',
      ),
      truckIds: [...new Set(items.map(d => d.truckId))],
      reportedByIds: [...new Set(items.map(d => d.reportedBy).filter((id): id is string => !!id))],
      firstSeenAt: oldest.createdAt,
      lastSeenAt: newest.createdAt,
      sampleDescription: newest.description,
    }
  })

  return groups.sort((a, b) => b.totalCount - a.totalCount || +new Date(b.lastSeenAt) - +new Date(a.lastSeenAt))
}
