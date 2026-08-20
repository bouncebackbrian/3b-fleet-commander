/**
 * actionLabels.ts — site-aware primary action labels for the driver cockpit
 *
 * The state machine's default labels ("Arrived Pickup", "Leave Pickup") are
 * generic on purpose (stateMachine.ts has no notion of a job or a site). This
 * module layers the active job's actual pickup/dump/yard site name on top,
 * purely for display — it never changes which event fires. Pure and tested
 * the same way the rest of src/lib/dumpTruck is.
 */
import type { DumpTruckEventType } from './types'

export interface SiteAwareLabelContext {
  pickupSiteName?: string | null
  dumpSiteName?: string | null
  yardSiteName?: string | null
  /** Active job's material (e.g. "Road Grindings") — labels the load/unload
   *  actions with what's actually being hauled, same idea as the site name. */
  material?: string | null
}

/**
 * Given the event a primary/secondary action would fire and its default
 * label, returns a label naming the actual site or material when one is
 * known — otherwise falls back to the default label unchanged. Shared by
 * the primary action button (CenterAction) and the Day Activity / Full Log
 * timeline (LogEntryRow) so both read the same way.
 */
export function siteAwareActionLabel(
  eventType: DumpTruckEventType | string | null,
  defaultLabel: string,
  ctx: SiteAwareLabelContext,
): string {
  switch (eventType) {
    case 'depart_yard':
      return ctx.pickupSiteName ? `Depart Yard — Heading to ${ctx.pickupSiteName}` : defaultLabel
    case 'arrive_pickup':
      return ctx.pickupSiteName ? `Arrived at ${ctx.pickupSiteName}` : defaultLabel
    case 'loading_started':
      return ctx.material ? `Load ${ctx.material}` : defaultLabel
    case 'loading_completed':
      return ctx.material ? `${ctx.material} Loaded` : defaultLabel
    case 'depart_pickup':
      return ctx.dumpSiteName ? `Leave Pickup — Heading to ${ctx.dumpSiteName}` : defaultLabel
    case 'arrive_dump':
      return ctx.dumpSiteName ? `Arrived at ${ctx.dumpSiteName}` : defaultLabel
    case 'unloading_started':
      return ctx.material ? `Drop ${ctx.material}` : defaultLabel
    case 'unloading_completed':
      return ctx.material ? `${ctx.material} Dropped` : defaultLabel
    case 'depart_dump':
      return ctx.yardSiteName ? `Leave Dump — Heading to ${ctx.yardSiteName}` : defaultLabel
    case 'arrive_yard':
      return ctx.yardSiteName ? `Arrived at ${ctx.yardSiteName}` : defaultLabel
    default:
      return defaultLabel
  }
}
