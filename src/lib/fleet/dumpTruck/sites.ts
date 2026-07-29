/**
 * fleet/dumpTruck/sites.ts — Dump Truck Mode site directory service functions
 *
 * Minimal admin CRUD for fleet_dt_sites. Full geocoding / map-pin editor
 * (spec §6, /admin/locations) is a documented follow-up — this is enough to
 * create yards/pickup/dump sites with coordinates entered by hand so the
 * driver flow is testable end-to-end.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { DumpTruckError } from './shared'
import type { DumpTruckSite, SiteType, PreferredNavPoint } from '@/lib/dumpTruck/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): DumpTruckSite {
  return {
    id: r.id,
    businessId: r.business_id,
    siteType: r.site_type,
    name: r.name,
    addressLine1: r.address_line1,
    addressLine2: r.address_line2,
    city: r.city,
    state: r.state,
    postalCode: r.postal_code,
    country: r.country,
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    geofenceRadiusM: Number(r.geofence_radius_m) || 300,
    entranceLat: r.entrance_lat != null ? Number(r.entrance_lat) : null,
    entranceLng: r.entrance_lng != null ? Number(r.entrance_lng) : null,
    scaleLat: r.scale_lat != null ? Number(r.scale_lat) : null,
    scaleLng: r.scale_lng != null ? Number(r.scale_lng) : null,
    preferredNavPoint: r.preferred_nav_point,
    customerName: r.customer_name,
    brokerName: r.broker_name,
    instructions: r.instructions,
    routeNotes: r.route_notes,
    gateCode: r.gate_code,
    gateInstructions: r.gate_instructions,
    restrictions: r.restrictions ?? {},
    approachDirection: r.approach_direction,
    avoidNotes: r.avoid_notes,
    contactName: r.contact_name,
    contactPhone: r.contact_phone,
    operatingHours: r.operating_hours ?? {},
    active: !!r.active,
    verified: !!r.verified,
  }
}

/** Columns considered safe to hand to a driver — gate_code/gate_instructions withheld unless dispatcher+. */
function driverSafeRow(site: DumpTruckSite): DumpTruckSite {
  return { ...site, gateCode: null, gateInstructions: null }
}

/** Lightweight projection used for geofence matching — avoids pulling gate codes etc. */
export async function getGeofenceSites(
  businessId: string,
): Promise<{ id: string; lat: number | null; lng: number | null; geofenceRadiusM: number }[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_sites')
    .select('id, lat, lng, geofence_radius_m')
    .eq('business_id', businessId)
    .eq('active', true)
  if (error) throw error
  return (data ?? []).map(r => ({ id: r.id, lat: r.lat, lng: r.lng, geofenceRadiusM: r.geofence_radius_m ?? 300 }))
}

export async function listSites(
  businessId: string,
  opts: { includeGateInfo: boolean } = { includeGateInfo: false },
): Promise<DumpTruckSite[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_sites')
    .select('*')
    .eq('business_id', businessId)
    .eq('active', true)
    .order('name', { ascending: true })
  if (error) throw error
  const sites = (data ?? []).map(fromRow)
  return opts.includeGateInfo ? sites : sites.map(driverSafeRow)
}

export interface CreateSiteInput {
  siteType: SiteType
  name: string
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  lat?: number | null
  lng?: number | null
  geofenceRadiusM?: number
  entranceLat?: number | null
  entranceLng?: number | null
  preferredNavPoint?: PreferredNavPoint
  customerName?: string | null
  instructions?: string | null
  routeNotes?: string | null
  gateCode?: string | null
  gateInstructions?: string | null
}

export async function createSite(
  businessId: string,
  input: CreateSiteInput,
  userId: string,
  email: string | null,
): Promise<DumpTruckSite> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_sites')
    .insert({
      business_id: businessId,
      site_type: input.siteType,
      name: input.name,
      address_line1: input.addressLine1 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      postal_code: input.postalCode ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      geofence_radius_m: input.geofenceRadiusM ?? 300,
      entrance_lat: input.entranceLat ?? null,
      entrance_lng: input.entranceLng ?? null,
      preferred_nav_point: input.preferredNavPoint ?? 'address',
      customer_name: input.customerName ?? null,
      instructions: input.instructions ?? null,
      route_notes: input.routeNotes ?? null,
      gate_code: input.gateCode ?? null,
      gate_instructions: input.gateInstructions ?? null,
      created_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error
  const site = fromRow(data)
  audit.log({ userId, email, action: 'dump_truck.site.create', resource: 'fleet_dt_sites', resourceId: site.id, after: site })
  return site
}

/**
 * Pin a site's GPS coordinates from wherever the caller is standing right
 * now. Deliberately narrow — only lat/lng, callable by any active business
 * member (not gated to admin/dispatcher like createSite) — a driver who
 * physically finds a remote site with no clean street address needs to be
 * able to record that fact themselves, on site, without waiting on
 * dispatch. Does not touch address/gate/contact fields.
 */
export async function updateSiteLocation(
  businessId: string, siteId: string, lat: number, lng: number,
  userId: string, email: string | null,
): Promise<DumpTruckSite> {
  const { data: existing } = await fleetServiceClient
    .from('fleet_dt_sites')
    .select('id, business_id')
    .eq('id', siteId)
    .maybeSingle()
  if (!existing || existing.business_id !== businessId) throw new DumpTruckError('Site not found', 404)

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_sites')
    .update({ lat, lng })
    .eq('id', siteId)
    .select('*')
    .single()
  if (error) throw error
  const site = fromRow(data)
  audit.log({ userId, email, action: 'dump_truck.site.pin_location', resource: 'fleet_dt_sites', resourceId: site.id, after: { lat, lng } })
  return site
}
