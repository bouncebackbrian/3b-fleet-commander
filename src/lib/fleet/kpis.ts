export type FleetKpiTier = 'basic' | 'advanced'

export interface FleetKpiDefinition {
  id: string
  label: string
  description: string
  tier: FleetKpiTier
  unit?: 'count' | 'hours' | 'minutes' | 'miles' | 'percent' | 'currency' | 'currency_per_mile' | 'currency_per_hour' | 'gallons' | 'tons' | 'loads'
  higherIsBetter?: boolean
}

export interface FleetModeKpiCatalog {
  modeId: string
  basic: FleetKpiDefinition[]
  advanced: FleetKpiDefinition[]
}

const commonBasic: FleetKpiDefinition[] = [
  { id: 'paid_hours', label: 'Paid Hours', description: 'Driver payable time recorded for the selected period.', tier: 'basic', unit: 'hours' },
  { id: 'operational_hours', label: 'Operational Hours', description: 'Total recorded company work time.', tier: 'basic', unit: 'hours' },
  { id: 'billable_hours', label: 'Billable Hours', description: 'Customer or broker billable time.', tier: 'basic', unit: 'hours' },
  { id: 'total_miles', label: 'Total Miles', description: 'Total business miles recorded by the asset.', tier: 'basic', unit: 'miles' },
  { id: 'fuel_gallons', label: 'Fuel Used', description: 'Recorded fuel consumed/purchased.', tier: 'basic', unit: 'gallons' },
]

const commonAdvanced: FleetKpiDefinition[] = [
  { id: 'time_leakage', label: 'Time Leakage', description: 'Operational time not converted into customer-billable time, classified for review rather than treated as unpaid time.', tier: 'advanced', unit: 'hours', higherIsBetter: false },
  { id: 'asset_utilization', label: 'Asset Utilization', description: 'Share of available asset time used productively.', tier: 'advanced', unit: 'percent', higherIsBetter: true },
  { id: 'cost_per_mile', label: 'Cost per Mile', description: 'Operating cost divided by business miles.', tier: 'advanced', unit: 'currency_per_mile', higherIsBetter: false },
  { id: 'revenue_per_mile', label: 'Revenue per Mile', description: 'Recognized revenue divided by business miles.', tier: 'advanced', unit: 'currency_per_mile', higherIsBetter: true },
  { id: 'margin_per_hour', label: 'Margin per Hour', description: 'Estimated operating margin per recorded operational hour.', tier: 'advanced', unit: 'currency_per_hour', higherIsBetter: true },
]

export const FLEET_MODE_KPIS: FleetModeKpiCatalog[] = [
  {
    modeId: 'dump-truck',
    basic: [
      ...commonBasic,
      { id: 'loads_completed', label: 'Loads Completed', description: 'Completed haul cycles.', tier: 'basic', unit: 'loads', higherIsBetter: true },
      { id: 'tons_hauled', label: 'Tons Hauled', description: 'Total recorded tons moved.', tier: 'basic', unit: 'tons', higherIsBetter: true },
      { id: 'avg_cycle_time', label: 'Average Cycle Time', description: 'Average time per completed haul cycle.', tier: 'basic', unit: 'minutes', higherIsBetter: false },
    ],
    advanced: [
      ...commonAdvanced,
      { id: 'loads_per_paid_hour', label: 'Loads per Paid Hour', description: 'Completed loads divided by paid driver hours.', tier: 'advanced', higherIsBetter: true },
      { id: 'tons_per_paid_hour', label: 'Tons per Paid Hour', description: 'Recorded tons divided by paid driver hours.', tier: 'advanced', higherIsBetter: true },
      { id: 'wait_time_by_site', label: 'Wait Time by Site', description: 'Breaks waiting/dead time down by pit, customer and dump site.', tier: 'advanced', unit: 'hours', higherIsBetter: false },
      { id: 'profit_per_truck_day', label: 'Profit per Truck Day', description: 'Estimated truck-level daily operating profit.', tier: 'advanced', unit: 'currency', higherIsBetter: true },
    ],
  },
  {
    modeId: 'water-truck',
    basic: [
      ...commonBasic,
      { id: 'refill_cycles', label: 'Refill Cycles', description: 'Completed fill/refill cycles.', tier: 'basic', unit: 'count', higherIsBetter: true },
      { id: 'gallons_delivered', label: 'Gallons Delivered', description: 'Recorded gallons used for productive work.', tier: 'basic', unit: 'gallons', higherIsBetter: true },
      { id: 'spray_hours', label: 'Spray Hours', description: 'Time actively performing spray/coverage work.', tier: 'basic', unit: 'hours', higherIsBetter: true },
    ],
    advanced: [
      ...commonAdvanced,
      { id: 'gallons_per_paid_hour', label: 'Gallons per Paid Hour', description: 'Productive gallons divided by paid driver hours.', tier: 'advanced', higherIsBetter: true },
      { id: 'fill_source_delay', label: 'Fill Source Delay', description: 'Time lost waiting to fill or refill.', tier: 'advanced', unit: 'hours', higherIsBetter: false },
      { id: 'coverage_efficiency', label: 'Coverage Efficiency', description: 'Productive spray/coverage time compared with total operating time.', tier: 'advanced', unit: 'percent', higherIsBetter: true },
    ],
  },
  {
    modeId: 'hotshot',
    basic: [
      ...commonBasic,
      { id: 'loads_delivered', label: 'Loads Delivered', description: 'Completed hotshot deliveries.', tier: 'basic', unit: 'loads', higherIsBetter: true },
      { id: 'deadhead_miles', label: 'Deadhead Miles', description: 'Miles driven without a revenue load.', tier: 'basic', unit: 'miles', higherIsBetter: false },
      { id: 'detention_hours', label: 'Detention Hours', description: 'Recorded detention time.', tier: 'basic', unit: 'hours', higherIsBetter: false },
    ],
    advanced: [
      ...commonAdvanced,
      { id: 'profit_per_load', label: 'Profit per Load', description: 'Estimated operating profit by completed load.', tier: 'advanced', unit: 'currency', higherIsBetter: true },
      { id: 'loaded_vs_deadhead', label: 'Loaded vs Deadhead Ratio', description: 'Share of miles producing revenue versus deadhead.', tier: 'advanced', unit: 'percent', higherIsBetter: true },
      { id: 'detention_recovery', label: 'Detention Recovery', description: 'How much recorded detention was successfully billed/recovered.', tier: 'advanced', unit: 'percent', higherIsBetter: true },
    ],
  },
  {
    modeId: 'otr',
    basic: [
      ...commonBasic,
      { id: 'loaded_miles', label: 'Loaded Miles', description: 'Miles traveled under a revenue load.', tier: 'basic', unit: 'miles', higherIsBetter: true },
      { id: 'deadhead_miles', label: 'Deadhead Miles', description: 'Miles traveled without a revenue load.', tier: 'basic', unit: 'miles', higherIsBetter: false },
      { id: 'detention_hours', label: 'Detention Hours', description: 'Recorded customer/shipper/receiver detention.', tier: 'basic', unit: 'hours', higherIsBetter: false },
    ],
    advanced: [
      ...commonAdvanced,
      { id: 'trip_margin', label: 'Trip Margin', description: 'Estimated revenue less tracked trip operating costs.', tier: 'advanced', unit: 'currency', higherIsBetter: true },
      { id: 'fuel_cost_per_mile', label: 'Fuel Cost per Mile', description: 'Fuel expense divided by trip miles.', tier: 'advanced', unit: 'currency_per_mile', higherIsBetter: false },
      { id: 'deadhead_percent', label: 'Deadhead %', description: 'Deadhead miles as a percentage of total business miles.', tier: 'advanced', unit: 'percent', higherIsBetter: false },
    ],
  },
  {
    modeId: 'regional',
    basic: [
      ...commonBasic,
      { id: 'stops_completed', label: 'Stops Completed', description: 'Completed route stops.', tier: 'basic', unit: 'count', higherIsBetter: true },
      { id: 'delay_hours', label: 'Delay Hours', description: 'Recorded route/customer delay time.', tier: 'basic', unit: 'hours', higherIsBetter: false },
    ],
    advanced: [
      ...commonAdvanced,
      { id: 'stops_per_paid_hour', label: 'Stops per Paid Hour', description: 'Completed stops divided by paid driver hours.', tier: 'advanced', higherIsBetter: true },
      { id: 'route_margin', label: 'Route Margin', description: 'Estimated route revenue less operating cost.', tier: 'advanced', unit: 'currency', higherIsBetter: true },
      { id: 'customer_wait_by_stop', label: 'Customer Wait by Stop', description: 'Identifies stops consistently creating excess dwell time.', tier: 'advanced', unit: 'hours', higherIsBetter: false },
    ],
  },
  {
    modeId: 'local',
    basic: [
      ...commonBasic,
      { id: 'stops_completed', label: 'Stops Completed', description: 'Completed local deliveries/service stops.', tier: 'basic', unit: 'count', higherIsBetter: true },
      { id: 'service_hours', label: 'Customer Service Time', description: 'Time spent servicing customer stops.', tier: 'basic', unit: 'hours' },
    ],
    advanced: [
      ...commonAdvanced,
      { id: 'stops_per_hour', label: 'Stops per Hour', description: 'Completed stops divided by operational hours.', tier: 'advanced', higherIsBetter: true },
      { id: 'route_cost', label: 'Route Cost', description: 'Estimated operating cost for the route/day.', tier: 'advanced', unit: 'currency', higherIsBetter: false },
      { id: 'on_time_percent', label: 'On-Time %', description: 'Share of stops completed within their target window.', tier: 'advanced', unit: 'percent', higherIsBetter: true },
    ],
  },
  {
    modeId: 'business-vehicle',
    basic: [
      { id: 'business_miles', label: 'Business Miles', description: 'Miles classified as business use.', tier: 'basic', unit: 'miles', higherIsBetter: true },
      { id: 'personal_miles', label: 'Personal Miles', description: 'Miles classified as personal use.', tier: 'basic', unit: 'miles' },
      { id: 'trip_count', label: 'Business Trips', description: 'Count of business-purpose trips.', tier: 'basic', unit: 'count', higherIsBetter: true },
      { id: 'vehicle_expenses', label: 'Vehicle Expenses', description: 'Tracked vehicle operating expenses.', tier: 'basic', unit: 'currency', higherIsBetter: false },
    ],
    advanced: [
      { id: 'cost_per_business_mile', label: 'Cost per Business Mile', description: 'Tracked operating cost divided by business miles.', tier: 'advanced', unit: 'currency_per_mile', higherIsBetter: false },
      { id: 'business_use_percent', label: 'Business Use %', description: 'Business miles divided by total recorded miles.', tier: 'advanced', unit: 'percent' },
      { id: 'expense_trend', label: 'Expense Trend', description: 'Change in vehicle operating expenses over time.', tier: 'advanced', unit: 'currency' },
    ],
  },
]

export function getModeKpis(modeId: string, tier: FleetKpiTier = 'basic'): FleetKpiDefinition[] {
  const catalog = FLEET_MODE_KPIS.find(item => item.modeId === modeId)
  if (!catalog) return []
  return tier === 'advanced' ? [...catalog.basic, ...catalog.advanced] : catalog.basic
}
