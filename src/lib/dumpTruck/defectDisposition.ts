/**
 * defectDisposition.ts — dispatch defect-review disposition rules (spec §5.1)
 *
 * Pure state-transition logic only — no DB, no auth. The service layer
 * (fleet/dumpTruck/incidents.ts) calls this to validate an action before
 * writing the defect row + the append-only fleet_dt_defect_dispositions
 * audit row + any fleet_equipment hold side effect.
 *
 * Explicit design rule from spec: acknowledgement never automatically means
 * mechanical release. 'acknowledge' only moves open -> acknowledged; a truck
 * hold is cleared only by the separate 'mark_operable' action, and a defect
 * is only closed by the separate 'resolve' action.
 */

export type DefectStatus = 'open' | 'acknowledged' | 'resolved' | 'deferred'

export type DefectDispositionAction =
  | 'acknowledge'
  | 'request_details'
  | 'assign_maintenance'
  | 'place_on_hold'
  | 'mark_operable'
  | 'resolve'
  | 'reopen'
  /** Not one of spec §5.1's seven — kept to preserve the "Defer" action the
   *  admin panel already had before this disposition system existed. */
  | 'defer'

export interface DispositionInput {
  action: DefectDispositionAction
  currentStatus: DefectStatus
  reason?: string | null
  instruction?: string | null
}

const VALID_FROM_STATUS: Record<DefectDispositionAction, DefectStatus[] | 'any'> = {
  acknowledge: ['open'],
  request_details: 'any',
  assign_maintenance: 'any',
  place_on_hold: 'any',
  mark_operable: 'any',
  resolve: ['open', 'acknowledged', 'deferred'],
  reopen: ['resolved', 'deferred'],
  defer: ['open', 'acknowledged'],
}

/** Actions that touch fleet_equipment.hold_status — the hard, dispatch-only
 *  truck block, distinct from a single defect's own open/acknowledged/resolved status. */
export function setsTruckHold(action: DefectDispositionAction): boolean {
  return action === 'place_on_hold'
}

export function clearsTruckHold(action: DefectDispositionAction): boolean {
  return action === 'mark_operable'
}

/** Actions that require the driver/dispatcher to actually write something down,
 *  not just click a button — matches the "documented, not silent" pattern used
 *  elsewhere in this app (see hectorReport.ts's override flow). */
export function requiresReason(action: DefectDispositionAction): boolean {
  return action === 'place_on_hold' || action === 'request_details'
}

export function requiresInstruction(action: DefectDispositionAction): boolean {
  return action === 'mark_operable'
}

export function canApplyDisposition(action: DefectDispositionAction, currentStatus: DefectStatus): boolean {
  const allowed = VALID_FROM_STATUS[action]
  return allowed === 'any' || allowed.includes(currentStatus)
}

/** The defect's own status after the action — most actions here are audit-only
 *  and don't move the defect's status (e.g. place_on_hold blocks the truck, but
 *  the defect itself is still just 'open' until someone actually resolves it). */
export function nextStatusFor(action: DefectDispositionAction, currentStatus: DefectStatus): DefectStatus {
  switch (action) {
    case 'acknowledge': return 'acknowledged'
    case 'resolve': return 'resolved'
    case 'reopen': return 'open'
    case 'defer': return 'deferred'
    default: return currentStatus
  }
}

export interface DispositionValidation {
  ok: boolean
  error?: string
}

/** Single entry point the service layer calls before writing anything. */
export function validateDisposition(input: DispositionInput): DispositionValidation {
  if (!canApplyDisposition(input.action, input.currentStatus)) {
    return { ok: false, error: `Cannot ${input.action} a defect that is currently ${input.currentStatus}` }
  }
  if (requiresReason(input.action) && !input.reason?.trim()) {
    return { ok: false, error: `${input.action} requires a reason` }
  }
  if (requiresInstruction(input.action) && !input.instruction?.trim()) {
    return { ok: false, error: `${input.action} requires an instruction for the driver` }
  }
  return { ok: true }
}
