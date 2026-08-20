/**
 * Human-readable labels for Dump Truck Mode event types.
 * Shared by RightRail's collapsed activity feed and the FullLogSheet.
 */
export const EVENT_LABELS: Record<string, string> = {
  clock_in: 'Clocked In', arrive_yard_for_pickup: 'Arrived at Yard', truck_picked_up: 'Truck Picked Up',
  pretrip_started: 'Pre-Trip Started', pretrip_completed: 'Pre-Trip Complete',
  depart_yard: 'Departed Yard', arrive_pickup: 'Arrived Pickup', loading_started: 'Loading Started',
  loading_completed: 'Loading Complete', depart_pickup: 'Left Pickup', arrive_dump: 'Arrived Dump',
  unloading_started: 'Unloading Started', unloading_completed: 'Dumped', depart_dump: 'Left Dump',
  arrive_yard: 'Arrived Yard', break_started: 'Break Started', break_ended: 'Break Ended',
  delay_started: 'Delay Started', delay_ended: 'Delay Ended', fuel_stop_started: 'Fuel Stop',
  fuel_stop_ended: 'Fuel Stop Ended', posttrip_started: 'Post-Trip Started', posttrip_completed: 'Post-Trip Complete',
  truck_dropped_off: 'Truck Dropped Off', clock_out: 'Clocked Out', shift_submitted: 'Day Submitted',
  note: 'Note', photo_captured: 'Photo', ticket_captured: 'Ticket', correction_requested: 'Correction Requested',
  location_logged: 'Location Logged',
  breakdown_reported: 'Truck Problem Reported', breakdown_resolved: 'Truck Problem Resolved',
}
