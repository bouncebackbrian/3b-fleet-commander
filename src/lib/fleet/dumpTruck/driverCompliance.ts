/**
 * fleet/dumpTruck/driverCompliance.ts — CDL + medical card compliance, per driver
 *
 * Structured fields (cdl_number/state/class/expiry, medical_expiry) already existed
 * on `profiles` from an earlier prototype (localStorage-only /settings page — never
 * actually persisted there). Reused here as the real, database-backed source of
 * truth. The photos themselves go through the existing fleet_dt_documents pipeline
 * (documents.ts) with linkedEntityType 'driver_profile', shiftId null — same
 * dedup/storage/signed-URL machinery already used for load tickets and fuel
 * receipts, just linked to a person instead of a shift.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { uploadDocument, getSignedDocumentUrl, type UploadDocumentInput } from './documents'

export type DriverDocType = 'cdl_front' | 'cdl_back' | 'medical_card'

export interface DriverCompliance {
  cdlNumber: string | null
  cdlState: string | null
  cdlClass: string | null
  cdlExpiry: string | null
  medicalExpiry: string | null
}

export interface UpsertDriverComplianceInput {
  cdlNumber?: string | null
  cdlState?: string | null
  cdlClass?: string | null
  cdlExpiry?: string | null
  medicalExpiry?: string | null
}

export async function getDriverCompliance(driverId: string): Promise<DriverCompliance> {
  const { data, error } = await fleetServiceClient
    .from('profiles')
    .select('cdl_number, cdl_state, cdl_class, cdl_expiry, medical_expiry')
    .eq('id', driverId)
    .maybeSingle()
  if (error) throw error
  return {
    cdlNumber: data?.cdl_number ?? null,
    cdlState: data?.cdl_state ?? null,
    cdlClass: data?.cdl_class ?? null,
    cdlExpiry: data?.cdl_expiry ?? null,
    medicalExpiry: data?.medical_expiry ?? null,
  }
}

export async function upsertDriverCompliance(driverId: string, input: UpsertDriverComplianceInput): Promise<void> {
  const row: Record<string, unknown> = {}
  if (input.cdlNumber !== undefined) row.cdl_number = input.cdlNumber
  if (input.cdlState !== undefined) row.cdl_state = input.cdlState
  if (input.cdlClass !== undefined) row.cdl_class = input.cdlClass
  if (input.cdlExpiry !== undefined) row.cdl_expiry = input.cdlExpiry
  if (input.medicalExpiry !== undefined) row.medical_expiry = input.medicalExpiry
  if (Object.keys(row).length === 0) return

  const { error } = await fleetServiceClient.from('profiles').update(row).eq('id', driverId)
  if (error) throw error
}

export interface DriverDocumentRow {
  id: string
  docType: string
  fileName: string
  createdAt: string
  signedUrl: string | null
}

/** All CDL/medical documents on file for one driver, most recent first, each
 *  with a short-lived signed URL for viewing (the storage bucket is private). */
export async function listDriverDocuments(businessId: string, driverId: string): Promise<DriverDocumentRow[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_documents')
    .select('id, doc_type, file_name, created_at')
    .eq('business_id', businessId)
    .eq('linked_entity_type', 'driver_profile')
    .eq('linked_entity_id', driverId)
    .order('created_at', { ascending: false })
  if (error) throw error

  return Promise.all((data ?? []).map(async r => ({
    id: r.id,
    docType: r.doc_type,
    fileName: r.file_name,
    createdAt: r.created_at,
    signedUrl: await getSignedDocumentUrl(businessId, r.id),
  })))
}

export async function uploadDriverDocument(
  businessId: string, driverId: string, docType: DriverDocType,
  fileName: string, mimeType: string, bytes: Buffer,
  userId: string, email: string | null,
): Promise<{ id: string }> {
  const input: UploadDocumentInput = {
    businessId, shiftId: null, docType,
    linkedEntityType: 'driver_profile', linkedEntityId: driverId,
    fileName, mimeType, bytes,
  }
  const result = await uploadDocument(input, userId, email)
  return { id: result.id }
}
