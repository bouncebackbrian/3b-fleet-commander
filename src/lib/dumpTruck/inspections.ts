/**
 * Dump Truck Mode — inspection completion + defect-severity gating
 *
 * Spec §8: "Safety-critical or out-of-service defects prevent normal
 * dispatch until an authorized person resolves or overrides them with a
 * documented reason." This module is the pure rule check; the API layer
 * enforces it before allowing `truck_picked_up` / `depart_yard` to fire.
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

/** True if a truck may dispatch (custody may open / drive may start) given its open defects. */
export function canDispatchWithDefects(
  openDefects: { severity: DefectSeverity; status: string }[],
  overrideReason: string | null,
): boolean {
  const blocking = openDefects.some(
    d => BLOCKING_SEVERITIES.includes(d.severity) && (d.status === 'open' || d.status === 'acknowledged'),
  )
  if (!blocking) return true
  return !!overrideReason && overrideReason.trim().length > 0
}
