export type MoveType = 'Loaded'|'Relay / Drop'|'Drop & Hook'|'Yard Move'|'Deadhead'|'Personal'
export type LoadStatus = 'Pending'|'In Transit'|'Complete'|'Issue'
export interface Load {
  id:string; date:string; loadNumber:string; bolRef?:string
  dispatcher:string; broker?:string; trailer?:string
  moveType:MoveType; driverType?:string; origin:string; destination:string
  status:LoadStatus; dispatchMiles:number; actualMiles:number
  deadheadMiles:number; paidMiles:number; cpmRate:number; fuelCost:number
  waitHours:number; detentionHours:number; detentionPay:number
  settlementPay:number; notes?:string; hosNotes?:string
  paperworkLocation?:string; proofSaved:boolean; settlementVerified:boolean
  createdAt:string; updatedAt:string
}
export interface DelayEntry {
  id:string; loadNumber:string; trailer?:string; delayType:string
  location:string; totalHours:number; billable:'Yes'|'No'|'Review'
  detentionRate?:number; potentialPay?:number
  dispatcherNotified:boolean; proofSaved:boolean; notes?:string; createdAt:string
}
export interface FuelEntry {
  id:string; date:string; location:string; fuelType:'Tractor'|'Reefer'|'DEF'
  gallons:number; pricePerGal?:number; totalCost:number
  loadNumber?:string; receiptSaved:boolean; notes?:string; createdAt:string
}
export interface SettlementAudit {
  id:string; weekEnding:string; loadNumber:string; trailer?:string
  actualMiles:number; paidMiles:number; missingMiles:number
  cpm:number; expectedPay:number; settlementPay:number; payGap:number
  verified:boolean; disputeNotes?:string; createdAt:string
}
