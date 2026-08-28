export type FleetModeStatus = 'live' | 'coming_soon'

export type FleetMode = {
  id: string
  name: string
  icon: string
  status: FleetModeStatus
  driverHref?: string
  summary: string
  driverValue: string[]
  companyValue: string[]
}

export const FLEET_MODES: FleetMode[] = [
  {
    id: 'dump-truck', name: 'Dump Truck', icon: '🚛', status: 'live', driverHref: '/driver/dump-truck',
    summary: 'Built around real haul cycles, broker sheets, tickets, time evidence and truck profitability.',
    driverValue: ['Simple load-cycle actions', 'Fuel + receipt evidence', 'Paid vs broker time visibility', 'Post-trip closes the workday'],
    companyValue: ['Loads / tons / miles', 'Billable vs non-billable time', 'Fuel + MPG', 'Weekly approval + audit trail'],
  },
  {
    id: 'water-truck', name: 'Water Truck', icon: '💧', status: 'coming_soon',
    summary: 'Fill, spray, refill, coverage and delay tracking designed around water-truck work.',
    driverValue: ['Fill-source capture', 'Spray start/stop', 'Refill cycles', 'Delay evidence'],
    companyValue: ['Gallons per paid hour', 'Coverage productivity', 'Fill-source delay', 'Fuel and cost per route'],
  },
  {
    id: 'hotshot', name: 'Hotshot', icon: '🛻', status: 'coming_soon',
    summary: 'Load, securement, deadhead, detention, POD and profit-per-mile for hotshot crews.',
    driverValue: ['Securement proof', 'Pickup / delivery windows', 'Detention capture', 'Deadhead visibility'],
    companyValue: ['Profit per load', 'Profit per mile', 'Deadhead cost', 'Broker + customer evidence'],
  },
  {
    id: 'otr', name: 'OTR', icon: '🛣️', status: 'coming_soon',
    summary: 'Long-haul trip, HOS, detention, fuel, BOL/POD and settlement workflow.',
    driverValue: ['Trip-focused cockpit', 'Detention + layover', 'Documents', 'Safe Drive controls'],
    companyValue: ['Revenue per mile', 'Trip margin', 'Settlement audit', 'Fuel and route efficiency'],
  },
  {
    id: 'regional', name: 'Regional', icon: '🗺️', status: 'coming_soon',
    summary: 'Multi-stop regional routes with daily/weekly production and delay visibility.',
    driverValue: ['Stop sequence', 'POD', 'Route delay capture', 'Weekly hours'],
    companyValue: ['Stop productivity', 'Route margin', 'Customer wait', 'Driver utilization'],
  },
  {
    id: 'local', name: 'Local', icon: '📍', status: 'coming_soon',
    summary: 'Clean local-driver flow for stops, proof, mileage, fuel and customer time.',
    driverValue: ['Simple route list', 'Proof of delivery', 'Mileage', 'Fuel'],
    companyValue: ['Stops per hour', 'Customer service time', 'Route cost', 'Vehicle utilization'],
  },
  {
    id: 'business-vehicle', name: 'Business Vehicle', icon: '🚙', status: 'coming_soon',
    summary: 'Mileage, trip purpose, receipts and business-use evidence for cars and pickups.',
    driverValue: ['Start / stop trip', 'Business purpose', 'Receipt capture', 'Mileage evidence'],
    companyValue: ['Business-mile reports', 'Vehicle cost', 'Tax-ready evidence', 'Maintenance history'],
  },
]
