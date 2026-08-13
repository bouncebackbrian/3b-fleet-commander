/**
 * defectCategory.ts — inspection item labels follow a "Category — detail"
 * convention (e.g. "Windshield chips or cracks — Cracked windshield"). The
 * same physical issue gets re-logged with different wording across repeated
 * pretrip inspections, so grouping by this category prefix is how we collapse
 * near-duplicates instead of relying on exact-text matches.
 *
 * Shared by hectorReport.ts (driver-facing report dedup) and
 * recurringIssues.ts (KPI aggregation) so both use the same grouping.
 */
export function defectCategory(description: string): string {
  return description.split(' — ')[0].trim().toLowerCase()
}
