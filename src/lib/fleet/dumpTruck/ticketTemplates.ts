/**
 * fleet/dumpTruck/ticketTemplates.ts — digital dispatch ticket templates (2026-07-30)
 *
 * One fixed field catalog (mirrors the existing fleet_dt_jobs dispatch-ticket
 * columns 1:1 — see 20260728_fleet_dt_jobs_dispatch_fields.sql) — a template
 * doesn't invent new fields, it only toggles which of these appear and whose
 * branding (broker, or the business itself when broker_id is null) shows on
 * the rendered ticket. Field VALUES always come from the job row itself at
 * render time; nothing is duplicated here.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import type { DumpTruckJob } from '@/lib/dumpTruck/types'

export interface TicketFieldDef {
  key: keyof Pick<DumpTruckJob,
    'poNumber' | 'customerName' | 'material' | 'estQuantity' | 'quantityUnit' | 'loadTime' | 'orderDate' |
    'deliveryDate' | 'cosigneeName' | 'orderedBy' | 'contactPhone' | 'truckType' | 'directions' |
    'pricePerHour' | 'pricePerTon' | 'fuelSurcharge' | 'materialCost'>
  label: string
}

export const TICKET_FIELD_CATALOG: TicketFieldDef[] = [
  { key: 'poNumber', label: 'PO Number' },
  { key: 'customerName', label: 'Customer' },
  { key: 'material', label: 'Material' },
  { key: 'estQuantity', label: 'Est. Quantity' },
  { key: 'quantityUnit', label: 'Unit' },
  { key: 'loadTime', label: 'Load Time' },
  { key: 'orderDate', label: 'Order Date' },
  { key: 'deliveryDate', label: 'Delivery Date' },
  { key: 'cosigneeName', label: 'Cosignee' },
  { key: 'orderedBy', label: 'Ordered By' },
  { key: 'contactPhone', label: 'Contact Phone' },
  { key: 'truckType', label: 'Truck Type' },
  { key: 'directions', label: 'Directions' },
  { key: 'pricePerHour', label: 'Price / Hour' },
  { key: 'pricePerTon', label: 'Price / Ton' },
  { key: 'fuelSurcharge', label: 'Fuel Surcharge' },
  { key: 'materialCost', label: 'Material Cost' },
]

const DEFAULT_FIELD_KEYS = TICKET_FIELD_CATALOG.map(f => f.key)

export interface TicketTemplate {
  id: string
  businessId: string
  brokerId: string | null
  name: string
  fieldKeys: string[]
  requiresCompanySignoff: boolean
  requiresDriverSignature: boolean
  referenceScanDocId: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): TicketTemplate {
  return {
    id: r.id, businessId: r.business_id, brokerId: r.broker_id, name: r.name,
    fieldKeys: Array.isArray(r.field_keys) ? r.field_keys : [],
    requiresCompanySignoff: r.requires_company_signoff, requiresDriverSignature: r.requires_driver_signature,
    referenceScanDocId: r.reference_scan_doc_id,
  }
}

export async function listTicketTemplates(businessId: string): Promise<TicketTemplate[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_ticket_templates')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

/** The generic (no broker) template for a business — auto-seeded if it doesn't exist yet. */
export async function getOrCreateGenericTemplate(businessId: string): Promise<TicketTemplate> {
  const { data: existing } = await fleetServiceClient
    .from('fleet_dt_ticket_templates')
    .select('*')
    .eq('business_id', businessId)
    .is('broker_id', null)
    .maybeSingle()
  if (existing) return fromRow(existing)

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_ticket_templates')
    .insert({
      business_id: businessId, broker_id: null, name: 'Fleet Commander (Generic)',
      field_keys: DEFAULT_FIELD_KEYS, requires_company_signoff: true, requires_driver_signature: true,
    })
    .select('*')
    .single()
  if (error) throw error
  return fromRow(data)
}

/** The template to use for a given broker (broker's own if one exists, else the generic default). */
export async function getEffectiveTemplate(businessId: string, brokerId: string | null): Promise<TicketTemplate> {
  if (brokerId) {
    const { data } = await fleetServiceClient
      .from('fleet_dt_ticket_templates')
      .select('*')
      .eq('business_id', businessId)
      .eq('broker_id', brokerId)
      .maybeSingle()
    if (data) return fromRow(data)
  }
  return getOrCreateGenericTemplate(businessId)
}

export interface UpsertTicketTemplateInput {
  brokerId?: string | null
  name: string
  fieldKeys: string[]
  requiresCompanySignoff?: boolean
  requiresDriverSignature?: boolean
  referenceScanDocId?: string | null
}

/** One template per (business, broker) — including broker null for the generic default. */
export async function upsertTicketTemplate(
  businessId: string, input: UpsertTicketTemplateInput, userId: string, email: string | null,
): Promise<TicketTemplate> {
  let query = fleetServiceClient.from('fleet_dt_ticket_templates').select('id').eq('business_id', businessId)
  query = input.brokerId ? query.eq('broker_id', input.brokerId) : query.is('broker_id', null)
  const { data: existing } = await query.maybeSingle()

  const row = {
    business_id: businessId,
    broker_id: input.brokerId ?? null,
    name: input.name,
    field_keys: input.fieldKeys,
    requires_company_signoff: input.requiresCompanySignoff ?? true,
    requires_driver_signature: input.requiresDriverSignature ?? true,
    reference_scan_doc_id: input.referenceScanDocId ?? null,
    created_by: userId,
  }

  const { data, error } = existing
    ? await fleetServiceClient.from('fleet_dt_ticket_templates').update(row).eq('id', existing.id).select('*').single()
    : await fleetServiceClient.from('fleet_dt_ticket_templates').insert(row).select('*').single()
  if (error) throw error

  const template = fromRow(data)
  audit.log({ userId, email, action: 'dump_truck.ticket_template.upsert', resource: 'fleet_dt_ticket_templates', resourceId: template.id, after: template })
  return template
}
