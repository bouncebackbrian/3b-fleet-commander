/**
 * Dump Truck Mode — inspection completion + defect-severity gating
 *
 * Safety-critical company holds may be acknowledged/overridden by an
 * authorized operational workflow with a documented reason. A true
 * out-of-service condition is a hard stop and cannot be bypassed here; it
 * remains unavailable until the Admin return-to-service workflow clears it.
 */

import type { DefectSeverity, InspectionItemInput, InspectionTemplateItem } from './types'

const BLOCKING_SEVERITIES: DefectSeverity[] = ['safety_critical', 'out_of_service']

export function hasBlockingDefect(items: Pick<InspectionItemInput, 'result' | 'severity'>[]): boolean {
  return items.some(i => i.result === 'defect' && i.severity != null && BLOCKING_SEVERITIES.includes(i.severity))
}

export interface InspectionValidationResult {
  valid: boolean
  errors: string[]
  missingItemKeys: string[]
}

/**
 * Ensures every non-N/A-eligible template item has a submitted result, and
 * that odometer-required items carry an odometer value on the parent inspection.
 */
export function validateInspectionSubmission(
  templateItems: InspectionTemplateItem[],
  submittedItems: InspectionItemInput[],
  odometer: number | null,
): InspectionValidationResult {
  const errors: string[] = []
  const missingItemKeys: string[] = []
  const submittedByKey = new Map(submittedItems.map(i => [i.itemKey, i]))

  for (const templateItem of templateItems) {
    const submitted = submittedByKey.get(templateItem.key)
    if (!submitted) {
      missingItemKeys.push(templateItem.key)
      continue
    }
    if (submitted.result === 'not_applicable' && !templateItem.allowNa) {
      errors.push(`"${templateItem.label}" cannot be marked Not Applicable`)
    }
    if (submitted.result === 'defect' && !submitted.notes && !submitted.severity) {
      errors.push(`"${templateItem.label}" is marked defect but has no severity`)
    }
    if (templateItem.requiresOdometer && odometer == null) {
      errors.push(`Odometer is required to complete this inspection ("${templateItem.label}")`)
    }
  }

  if (missingItemKeys.length) {
    errors.push(`${missingItemKeys.length} checklist item(s) have no result recorded`)
  }

  return { valid: errors.length === 0, errors, missingItemKeys }
}

/**
 * True if a truck may dispatch given its open defects.
 * - out_of_service: never bypassed here; Admin return-to-service approval is required.
 * - safety_critical: may proceed only through an authorized documented override flow.
 */
export function canDispatchWithDefects(
  openDefects: { severity: DefectSeverity; status: string }[],
  overrideReason: string | null,
): boolean {
  const active = openDefects.filter(d => d.status === 'open' || d.status === 'acknowledged')
  if (active.some(d => d.severity === 'out_of_service')) return false

  const safetyCritical = active.some(d => d.severity === 'safety_critical')
  if (!safetyCritical) return true
  return !!overrideReason && overrideReason.trim().length > 0
}
