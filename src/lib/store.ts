import type { Load, DelayEntry, FuelEntry } from '@/types'
const uid = () => Math.random().toString(36).slice(2)
const now = () => new Date().toISOString()
export const SAMPLE_LOADS: Load[] = [
  {
    id:uid(), date:'2026-05-14', loadNumber:'0241482', dispatcher:'Trev',
    broker:'', trailer:'260692', moveType:'Relay / Drop', driverType:'Solo',
    origin:'Amargosa Valley, NV', destination:'Walmart DC Sparks, NV',
    status:'Complete', dispatchMiles:335, actualMiles:0, deadheadMiles:0,
    paidMiles:0, cpmRate:0.55, fuelCost:61.17, waitHours:0,
    detentionHours:0, detentionPay:0, settlementPay:0,
    notes:'Dropped trailer 260692 at Walmart guard shack.',
    hosNotes:'Reset completed before northbound recovery.',
    paperworkLocation:'Guard shack', proofSaved:true, settlementVerified:false,
    createdAt:now(), updatedAt:now()
  },
  {
    id:uid(), date:'2026-05-14', loadNumber:'928262475', bolRef:'928262475',
    dispatcher:'Trev', broker:'PetSmart', trailer:'P5159671', moveType:'Yard Move',
    driverType:'Solo', origin:'PetSmart DC41, McCarran, NV',
    destination:'Spice Island / Star yard, Sparks, NV', status:'Complete',
    dispatchMiles:20, actualMiles:0, deadheadMiles:0, paidMiles:0, cpmRate:0.55,
    fuelCost:0, waitHours:1.43, detentionHours:0, detentionPay:0, settlementPay:0,
    notes:'USA Pkwy/McCarran congestion. 30-min break near Electric Ave.',
    hosNotes:'Required 30-min break taken.',
    paperworkLocation:'Front of trailer, Spice Island yard space 40',
    proofSaved:true, settlementVerified:false, createdAt:now(), updatedAt:now()
  }
]
export const SAMPLE_DELAYS: DelayEntry[] = [
  {
    id:uid(), loadNumber:'928262475', trailer:'P5159671', delayType:'Traffic',
    location:'USA Pkwy/McCarran to Spice Island', totalHours:1.43, billable:'No',
    dispatcherNotified:true, proofSaved:true,
    notes:'20 miles showed ~1h 26min. Screenshots saved.', createdAt:now()
  },
  {
    id:uid(), loadNumber:'928262475', trailer:'P5159671', delayType:'No receiving driver',
    location:'Spice Island yard space 40', totalHours:0, billable:'Review',
    dispatcherNotified:true, proofSaved:true,
    notes:'No receiving driver. Paperwork secured on front of trailer.', createdAt:now()
  }
]
export const SAMPLE_FUEL: FuelEntry[] = [
  {
    id:uid(), date:'2026-05-14', location:"Love's Tonopah, 1170 US-95, Tonopah, NV",
    fuelType:'Reefer', gallons:9.948, pricePerGal:6.149, totalCost:61.17,
    loadNumber:'0241482', receiptSaved:true, notes:'$61.17 reefer top-off.', createdAt:now()
  }
]
export function classify(load: Load): { label:string; color:string } {
  const est = load.dispatchMiles * load.cpmRate
  const unpaid = Math.max((load.actualMiles||0)-(load.paidMiles||0),0)
  if (load.moveType==='Yard Move' && load.dispatchMiles<30 && load.waitHours>1) return {label:'Weak',color:'warn'}
  if (unpaid>25) return {label:'Issue',color:'error'}
  if (load.dispatchMiles>=500) return {label:'Excellent',color:'primary'}
  if (load.dispatchMiles>=300 && load.fuelCost<est*.4) return {label:'Good',color:'success'}
  if (load.dispatchMiles>=100) return {label:'Average',color:'muted'}
  return {label:'Weak',color:'warn'}
}
export function calcMetrics(loads: Load[]) {
  const dispatchMiles=loads.reduce((a,l)=>a+l.dispatchMiles,0)
  const actualMiles=loads.reduce((a,l)=>a+(l.actualMiles||0),0)
  const paidMiles=loads.reduce((a,l)=>a+(l.paidMiles||0),0)
  const estPay=loads.reduce((a,l)=>a+l.dispatchMiles*l.cpmRate,0)
  const settlementPay=loads.reduce((a,l)=>a+(l.settlementPay||0),0)
  const fuel=loads.reduce((a,l)=>a+(l.fuelCost||0),0)
  const waitHours=loads.reduce((a,l)=>a+(l.waitHours||0),0)
  return {totalLoads:loads.length,dispatchMiles,actualMiles,paidMiles,estPay,settlementPay,fuel,waitHours,unpaidMiles:Math.max(actualMiles-paidMiles,0),payGap:Math.max(estPay-settlementPay,0)}
}
