export type FleetCapability =
  | 'hours_view'
  | 'hours_approve'
  | 'hours_correct'
  | 'reports_view'
  | 'reports_generate'
  | 'kpi_view'
  | 'kpi_export'
  | 'driver_status_view'
  | 'dispatch_assign'
  | 'dispatch_message'
  | 'tickets_view'
  | 'tickets_manage'
  | 'fuel_view'
  | 'exceptions_manage'

export const FLEET_CAPABILITY_LABELS: Record<FleetCapability, string> = {
  hours_view: 'View driver hours',
  hours_approve: 'Approve driver hours',
  hours_correct: 'Correct driver hours',
  reports_view: 'View reports',
  reports_generate: 'Generate reports',
  kpi_view: 'View KPIs',
  kpi_export: 'Export KPIs',
  driver_status_view: 'View driver status',
  dispatch_assign: 'Assign dispatch work',
  dispatch_message: 'Send dispatch messages',
  tickets_view: 'View tickets / proof',
  tickets_manage: 'Manage tickets / proof',
  fuel_view: 'View operational fuel data',
  exceptions_manage: 'Manage operational exceptions',
}

/**
 * Portals and capabilities are separate:
 * - portal = where the member can enter (driver / dispatch / broker / admin)
 * - capability = what the member may do there
 * - business permissions = access to company-owned account sections
 *
 * A Lead Dispatcher can therefore have the Dispatch portal plus hours_approve,
 * reports_generate and kpi_view without receiving payroll rates, billing,
 * Authorized Users, subscriptions, or company ownership controls.
 */
export function hasFleetCapability(
  capabilities: FleetCapability[],
  capability: FleetCapability,
): boolean {
  return capabilities.includes(capability)
}
