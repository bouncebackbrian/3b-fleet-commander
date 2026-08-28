export type FleetPortal = 'driver' | 'dispatch' | 'admin'

export type ModeKpi = { label: string; hint: string }
export type ModeAction = { label: string; detail: string }

export type ModeUiConfig = {
  id: string
  name: string
  icon: string
  driverTitle: string
  workUnitLabel: string
  primaryFlow: string[]
  driverActions: ModeAction[]
  dispatchActions: ModeAction[]
  adminActions: ModeAction[]
  driverKpis: ModeKpi[]
  dispatchKpis: ModeKpi[]
  adminKpis: ModeKpi[]
}

export const MODE_UI: Record<string, ModeUiConfig> = {
  'dump-truck': {
    id: 'dump-truck', name: 'Dump Truck', icon: '🚛', driverTitle: 'Haul Day', workUnitLabel: 'Load',
    primaryFlow: ['Assigned Job', 'Clock In', 'Pre-Trip', 'Pickup', 'Dump', 'Repeat Loads', 'Post-Trip', 'Clock Out'],
    driverActions: [
      { label: 'Today’s Job', detail: 'Pickup, dump site, material and load goal' },
      { label: 'Load Ticket', detail: 'Scan or attach ticket evidence' },
      { label: 'Delay / Problem', detail: 'Capture wait, breakdown or route change' },
      { label: 'Fuel', detail: 'Fuel and receipt evidence' },
    ],
    dispatchActions: [
      { label: 'Assign Job', detail: 'Assign job to truck / asset' },
      { label: 'Live Haul Board', detail: 'Loads, cycle state and delays' },
      { label: 'Exceptions', detail: 'Breakdowns, holds and missing paperwork' },
      { label: 'Sites', detail: 'Pickup / dump instructions and history' },
    ],
    adminActions: [
      { label: 'Company Overview', detail: 'Fleet production and readiness' },
      { label: 'Hours & Approvals', detail: 'Review hours and corrections' },
      { label: 'Assets', detail: 'Equipment, compliance and maintenance' },
      { label: 'Reports', detail: 'Production, delay, safety and trend reports' },
    ],
    driverKpis: [
      { label: 'Loads Today', hint: 'Completed haul cycles' }, { label: 'Paid Hours', hint: 'Clocked work time' },
      { label: 'Wait Time', hint: 'Delay / queue time' }, { label: 'Miles', hint: 'Shift mileage' },
    ],
    dispatchKpis: [
      { label: 'Active Trucks', hint: 'Assets currently working' }, { label: 'Loads / Hr', hint: 'Current production rate' },
      { label: 'Avg Cycle', hint: 'Pickup-to-dump cycle time' }, { label: 'Delayed Trucks', hint: 'Current exceptions' },
    ],
    adminKpis: [
      { label: 'Loads', hint: 'Period production' }, { label: 'Tons / Loads', hint: 'Material production' },
      { label: 'Billable %', hint: 'Billable vs paid time' }, { label: 'Cost / Load', hint: 'Operating efficiency' },
    ],
  },
  'water-truck': {
    id: 'water-truck', name: 'Water Truck', icon: '💧', driverTitle: 'Water Route', workUnitLabel: 'Fill / Spray Cycle',
    primaryFlow: ['Assigned Route', 'Clock In', 'Pre-Trip', 'Fill', 'Spray / Dust Control', 'Refill', 'Post-Trip', 'Clock Out'],
    driverActions: [
      { label: 'Today’s Route', detail: 'Assigned zones, fill source and instructions' },
      { label: 'Fill', detail: 'Record fill source and gallons' },
      { label: 'Spray Run', detail: 'Start / stop coverage activity' },
      { label: 'Delay / Problem', detail: 'Fill wait, access or equipment issue' },
    ],
    dispatchActions: [
      { label: 'Assign Route', detail: 'Assign zones and fill source to asset' },
      { label: 'Coverage Board', detail: 'See active spray zones and refill state' },
      { label: 'Fill Sources', detail: 'Availability and wait conditions' },
      { label: 'Exceptions', detail: 'Low water, downtime and access issues' },
    ],
    adminActions: [
      { label: 'Coverage Overview', detail: 'Production by route and asset' },
      { label: 'Hours & Approvals', detail: 'Review paid time and corrections' },
      { label: 'Assets', detail: 'Tank, pump, inspection and maintenance' },
      { label: 'Reports', detail: 'Gallons, coverage, delays and costs' },
    ],
    driverKpis: [
      { label: 'Gallons', hint: 'Gallons delivered today' }, { label: 'Cycles', hint: 'Fill / spray cycles' },
      { label: 'Coverage Time', hint: 'Active spray time' }, { label: 'Wait Time', hint: 'Fill / access delay' },
    ],
    dispatchKpis: [
      { label: 'Active Units', hint: 'Water trucks working' }, { label: 'Gallons / Hr', hint: 'Current productivity' },
      { label: 'Fill Wait', hint: 'Average source delay' }, { label: 'Coverage Gaps', hint: 'Unserved assigned zones' },
    ],
    adminKpis: [
      { label: 'Total Gallons', hint: 'Period water delivery' }, { label: 'Gallons / Paid Hr', hint: 'Labor productivity' },
      { label: 'Fill Delay %', hint: 'Time lost at fill sources' }, { label: 'Cost / 1K Gal', hint: 'Operating efficiency' },
    ],
  },
  hotshot: {
    id: 'hotshot', name: 'Hotshot', icon: '🛻', driverTitle: 'Hotshot Load', workUnitLabel: 'Load',
    primaryFlow: ['Assigned Load', 'Clock In', 'Pre-Trip', 'Pickup', 'Securement', 'Drive', 'Delivery / POD', 'Post-Trip', 'Clock Out'],
    driverActions: [
      { label: 'Load Details', detail: 'Pickup, delivery, commodity and windows' },
      { label: 'Securement Proof', detail: 'Photos and load securement evidence' },
      { label: 'POD', detail: 'Delivery proof and receiver' },
      { label: 'Detention', detail: 'Capture customer wait time' },
    ],
    dispatchActions: [
      { label: 'Assign Load', detail: 'Match load to truck / trailer' },
      { label: 'Load Board', detail: 'Pickup, in transit and delivered' },
      { label: 'Windows', detail: 'Pickup / delivery appointment risk' },
      { label: 'Exceptions', detail: 'Detention, breakdown and late risk' },
    ],
    adminActions: [
      { label: 'Margin Overview', detail: 'Revenue, miles and load margin' },
      { label: 'Hours & Settlements', detail: 'Driver evidence and pay support' },
      { label: 'Assets', detail: 'Truck / trailer readiness' },
      { label: 'Reports', detail: 'Deadhead, margin, detention and customer trends' },
    ],
    driverKpis: [
      { label: 'Loaded Miles', hint: 'Miles under load' }, { label: 'Deadhead', hint: 'Empty reposition miles' },
      { label: 'Detention', hint: 'Customer wait time' }, { label: 'Stops', hint: 'Pickup / delivery progress' },
    ],
    dispatchKpis: [
      { label: 'Loads Moving', hint: 'Active shipments' }, { label: 'On-Time %', hint: 'Appointment performance' },
      { label: 'Deadhead %', hint: 'Empty mileage share' }, { label: 'Detention', hint: 'Loads currently waiting' },
    ],
    adminKpis: [
      { label: 'Revenue / Mile', hint: 'Gross revenue efficiency' }, { label: 'Margin / Load', hint: 'Estimated operating margin' },
      { label: 'Deadhead %', hint: 'Non-revenue mileage' }, { label: 'Detention Cost', hint: 'Customer wait impact' },
    ],
  },
  otr: {
    id: 'otr', name: 'OTR', icon: '🛣️', driverTitle: 'Trip', workUnitLabel: 'Trip',
    primaryFlow: ['Assigned Trip', 'Clock In', 'Pre-Trip', 'Pickup / BOL', 'Drive / HOS', 'Fuel / Stops', 'Delivery / POD', 'Post-Trip', 'Clock Out'],
    driverActions: [
      { label: 'Trip Plan', detail: 'Route, appointments and stops' },
      { label: 'Documents', detail: 'BOL, POD and receipts' },
      { label: 'HOS / Rest', detail: 'Driving and rest status' },
      { label: 'Detention / Layover', detail: 'Capture compensated delays' },
    ],
    dispatchActions: [
      { label: 'Assign Trip', detail: 'Load, route and appointment plan' },
      { label: 'Trip Board', detail: 'Current trip stage and ETA' },
      { label: 'HOS Risk', detail: 'Available drive time and appointment exposure' },
      { label: 'Exceptions', detail: 'Detention, weather, breakdown and route risk' },
    ],
    adminActions: [
      { label: 'Fleet Margin', detail: 'Revenue, fuel and trip performance' },
      { label: 'Settlements', detail: 'Audit trip evidence and settlement data' },
      { label: 'Assets', detail: 'Tractor / trailer readiness and compliance' },
      { label: 'Reports', detail: 'RPM, MPG, utilization, detention and margin' },
    ],
    driverKpis: [
      { label: 'Miles Today', hint: 'Trip mileage today' }, { label: 'Drive Time', hint: 'Driving time today' },
      { label: 'HOS Remaining', hint: 'Available driving hours' }, { label: 'ETA', hint: 'Next appointment ETA' },
    ],
    dispatchKpis: [
      { label: 'Trips Moving', hint: 'Active OTR trips' }, { label: 'On-Time %', hint: 'Appointment performance' },
      { label: 'HOS Risk', hint: 'Trips at HOS risk' }, { label: 'Detention', hint: 'Current wait exposure' },
    ],
    adminKpis: [
      { label: 'Revenue / Mile', hint: 'Gross revenue per mile' }, { label: 'MPG', hint: 'Fuel efficiency' },
      { label: 'Trip Margin', hint: 'Estimated margin' }, { label: 'Utilization', hint: 'Productive asset time' },
    ],
  },
  regional: {
    id: 'regional', name: 'Regional', icon: '🗺️', driverTitle: 'Regional Route', workUnitLabel: 'Stop',
    primaryFlow: ['Assigned Route', 'Clock In', 'Pre-Trip', 'Stop Sequence', 'POD / Pickup', 'Return / Overnight', 'Post-Trip', 'Clock Out'],
    driverActions: [
      { label: 'Route Stops', detail: 'Today’s ordered stop list' },
      { label: 'POD / Pickup', detail: 'Capture stop completion evidence' },
      { label: 'Delay', detail: 'Customer, traffic and dock delay' },
      { label: 'Fuel', detail: 'Fuel and receipt evidence' },
    ],
    dispatchActions: [
      { label: 'Build Route', detail: 'Assign stops and sequence' },
      { label: 'Route Board', detail: 'Stop progress by driver / asset' },
      { label: 'ETA Risk', detail: 'Late stop and route exposure' },
      { label: 'Exceptions', detail: 'Customer delay and missed stop risk' },
    ],
    adminActions: [
      { label: 'Route Performance', detail: 'Stops, miles and route productivity' },
      { label: 'Hours & Approvals', detail: 'Weekly driver time evidence' },
      { label: 'Assets', detail: 'Regional fleet readiness' },
      { label: 'Reports', detail: 'Route margin, stops, delays and utilization' },
    ],
    driverKpis: [
      { label: 'Stops Done', hint: 'Completed route stops' }, { label: 'Stops Left', hint: 'Remaining stops' },
      { label: 'Miles', hint: 'Route mileage' }, { label: 'Delay', hint: 'Customer / route delay' },
    ],
    dispatchKpis: [
      { label: 'Routes Active', hint: 'Routes in progress' }, { label: 'Stops / Hr', hint: 'Current productivity' },
      { label: 'On-Time %', hint: 'Stop performance' }, { label: 'At-Risk Stops', hint: 'Late ETA exposure' },
    ],
    adminKpis: [
      { label: 'Stops / Paid Hr', hint: 'Labor productivity' }, { label: 'Route Margin', hint: 'Estimated route margin' },
      { label: 'Customer Wait', hint: 'Service delay' }, { label: 'Utilization', hint: 'Driver / asset productive time' },
    ],
  },
  local: {
    id: 'local', name: 'Local', icon: '📍', driverTitle: 'Local Route', workUnitLabel: 'Stop',
    primaryFlow: ['Assigned Route', 'Clock In', 'Pre-Trip', 'Stops', 'POD / Service', 'Return Yard', 'Post-Trip', 'Clock Out'],
    driverActions: [
      { label: 'Today’s Stops', detail: 'Simple local stop list' },
      { label: 'Complete Stop', detail: 'POD, photo or service confirmation' },
      { label: 'Customer Delay', detail: 'Capture wait / access issue' },
      { label: 'Fuel', detail: 'Fuel and mileage evidence' },
    ],
    dispatchActions: [
      { label: 'Assign Route', detail: 'Assign local route to asset' },
      { label: 'Stop Board', detail: 'Live stop completion' },
      { label: 'Customer Windows', detail: 'Service window status' },
      { label: 'Exceptions', detail: 'Missed stop, delay and vehicle issue' },
    ],
    adminActions: [
      { label: 'Local Operations', detail: 'Stops, hours and vehicle utilization' },
      { label: 'Hours & Approvals', detail: 'Driver time and corrections' },
      { label: 'Assets', detail: 'Local vehicle readiness' },
      { label: 'Reports', detail: 'Stops, service time, cost and customer trends' },
    ],
    driverKpis: [
      { label: 'Stops Done', hint: 'Completed stops' }, { label: 'Stops Left', hint: 'Remaining stops' },
      { label: 'Route Miles', hint: 'Local mileage' }, { label: 'Service Time', hint: 'Customer stop time' },
    ],
    dispatchKpis: [
      { label: 'Routes Active', hint: 'Local routes in progress' }, { label: 'Stops / Hr', hint: 'Current productivity' },
      { label: 'On-Time %', hint: 'Window performance' }, { label: 'Exceptions', hint: 'Routes needing attention' },
    ],
    adminKpis: [
      { label: 'Stops / Hr', hint: 'Labor productivity' }, { label: 'Cost / Stop', hint: 'Operating efficiency' },
      { label: 'Service Time', hint: 'Average customer time' }, { label: 'Vehicle Utilization', hint: 'Productive vehicle use' },
    ],
  },
  'business-vehicle': {
    id: 'business-vehicle', name: 'Business Vehicle', icon: '🚙', driverTitle: 'Business Trip', workUnitLabel: 'Trip',
    primaryFlow: ['Trip Purpose', 'Clock In / Start Trip', 'Start Odometer', 'Drive', 'Receipt / Expense', 'End Odometer', 'End Trip'],
    driverActions: [
      { label: 'Trip Purpose', detail: 'Business reason and destination' },
      { label: 'Mileage', detail: 'Start / end odometer evidence' },
      { label: 'Receipt', detail: 'Capture trip expense' },
      { label: 'Note', detail: 'Business-use documentation' },
    ],
    dispatchActions: [
      { label: 'Assign Vehicle', detail: 'Vehicle / employee assignment' },
      { label: 'Trip Log', detail: 'Current business-use trips' },
      { label: 'Exceptions', detail: 'Missing mileage or receipt evidence' },
      { label: 'Vehicle Status', detail: 'Availability and maintenance' },
    ],
    adminActions: [
      { label: 'Business Use', detail: 'Mileage and cost overview' },
      { label: 'Expenses', detail: 'Receipts and business-use evidence' },
      { label: 'Assets', detail: 'Vehicle documents and maintenance' },
      { label: 'Reports', detail: 'Mileage, cost, purpose and tax-ready evidence' },
    ],
    driverKpis: [
      { label: 'Business Miles', hint: 'Miles logged today' }, { label: 'Trips', hint: 'Business trips completed' },
      { label: 'Expenses', hint: 'Captured trip expenses' }, { label: 'Missing Proof', hint: 'Trips needing evidence' },
    ],
    dispatchKpis: [
      { label: 'Vehicles Out', hint: 'Vehicles in use' }, { label: 'Trips Today', hint: 'Business trips' },
      { label: 'Missing Mileage', hint: 'Incomplete trip logs' }, { label: 'Service Due', hint: 'Maintenance attention' },
    ],
    adminKpis: [
      { label: 'Business Miles', hint: 'Period business mileage' }, { label: 'Cost / Mile', hint: 'Operating cost' },
      { label: 'Business Use %', hint: 'Business vs total use' }, { label: 'Evidence Complete', hint: 'Tax-ready trip records' },
    ],
  },
}

export function getModeUi(id: string): ModeUiConfig | null {
  return MODE_UI[id] ?? null
}
