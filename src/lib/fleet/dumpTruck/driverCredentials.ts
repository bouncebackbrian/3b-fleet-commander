/**
 * fleet/dumpTruck/driverCredentials.ts — multi-credential driver identity
 *
 * Replaces the old single-CDL profiles.cdl_* fields (see
 * supabase/migrations/20260820_fleet_driver_credentials.sql for the "why").
 * One 3B ID, many credentials — CDL Class A, a separate Class B permit,
 * endorsements, medical card, future TWIC/hazmat, each independently
 * tracked with its own number/state/dates/photos/verification status.
 *
 * Front/back photos go through the existing fleet_dt_documents pipeline
 * (documents.ts) — same private-bucket/dedup machinery already used for
 * load tickets and fuel receipts, linked by direct front_doc_id/back_doc_id
 * FK columns (one photo per slot, mirrors the ticket_instances signature
 * pattern rather than the polymorphic linked_entity pattern used where a
 * record can have many photos).
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { uploadDocument, getSignedDocumentUrl } from './documents'
import { DumpTruckError } from './shared'

export type CredentialType =
  | 'cdl_class_a' | 'cdl_class_b' | 'cdl_class_c'
  | 'permit_class_a' | 'permit_class_b' | 'permit_class_c'
  | 'endorsement_passenger' | 'endorsement_tanker' | 'endorsement_hazmat'
  | 'endorsement_doubles_triples' | 'endorsement_school_bus'
  | 'medical_card' | 'twic' | 'other'

export const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  cdl_class_a: 'CDL Class A', cdl_class_b: 'CDL Class B', cdl_class_c: 'CDL Class C',
  permit_class_a: 'Permit Class A', permit_class_b: 'Permit Class B', permit_class_c: 'Permit Class C',
  endorsement_passenger: 'Passenger Endorsement', endorsement_tanker: 'Tanker Endorsement',
  endorsement_hazmat: 'Hazmat Endorsement', endorsement_doubles_triples: 'Doubles/Triples Endorsement',
  endorsement_school_bus: 'School Bus Endorsement',
  medical_card: 'Medical Card', twic: 'TWIC', other: 'Other',
}

export type VerificationStatus = 'unverified' | 'pending' | 'verified'

export interface DriverCredential {
  id: string
  businessId: string
  driverId: string
  credentialType: CredentialType
  label: string | null
  number: string | null
  issuingState: string | null
  class: string | null
  endorsements: string[]
  restrictions: string[]
  issueDate: string | null
  expiryDate: string | null
  frontDocId: string | null
  backDocId: string | null
  frontSignedUrl: string | null
  backSignedUrl: string | null
  verificationStatus: VerificationStatus
  verifiedBy: string | null
  verifiedAt: string | null
  notes: string | null
  active: boolean
  createdAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): Omit<DriverCredential, 'frontSignedUrl' | 'backSignedUrl'> {
  return {
    id: r.id, businessId: r.business_id, driverId: r.driver_id, credentialType: r.credential_type, label: r.label,
    number: r.number, issuingState: r.issuing_state, class: r.class,
    endorsements: r.endorsements ?? [], restrictions: r.restrictions ?? [],
    issueDate: r.issue_date, expiryDate: r.expiry_date,
    frontDocId: r.front_doc_id, backDocId: r.back_doc_id,
    verificationStatus: r.verification_status, verifiedBy: r.verified_by, verifiedAt: r.verified_at,
    notes: r.notes, active: r.active, createdAt: r.created_at,
  }
}

async function withSignedUrls(businessId: string, row: Omit<DriverCredential, 'frontSignedUrl' | 'backSignedUrl'>): Promise<DriverCredential> {
  const [frontSignedUrl, backSignedUrl] = await Promise.all([
    row.frontDocId ? getSignedDocumentUrl(businessId, row.frontDocId) : Promise.resolve(null),
    row.backDocId ? getSignedDocumentUrl(businessId, row.backDocId) : Promise.resolve(null),
  ])
  return { ...row, frontSignedUrl, backSignedUrl }
}

/** All active credentials for a driver, most-recently-added first. */
export async function listDriverCredentials(businessId: string, driverId: string): Promise<DriverCredential[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_driver_credentials')
    .select('*')
    .eq('business_id', businessId)
    .eq('driver_id', driverId)
    .eq('active', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  return Promise.all((data ?? []).map(r => withSignedUrls(businessId, fromRow(r))))
}

export interface CreateCredentialInput {
  credentialType: CredentialType
  label?: string | null
  number?: string | null
  issuingState?: string | null
  class?: string | null
  endorsements?: string[]
  restrictions?: string[]
  issueDate?: string | null
  expiryDate?: string | null
  notes?: string | null
}

/** A driver adds a new credential — self-service, same "record physical reality" rationale as other driver-entered data. */
export async function createDriverCredential(
  businessId: string, driverId: string, input: CreateCredentialInput, userId: string, email: string | null,
): Promise<DriverCredential> {
  const { data, error } = await fleetServiceClient
    .from('fleet_driver_credentials')
    .insert({
      business_id: businessId, driver_id: driverId, credential_type: input.credentialType, label: input.label ?? null,
      number: input.number ?? null, issuing_state: input.issuingState ?? null, class: input.class ?? null,
      endorsements: input.endorsements ?? [], restrictions: input.restrictions ?? [],
      issue_date: input.issueDate ?? null, expiry_date: input.expiryDate ?? null,
      created_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error
  const credential = await withSignedUrls(businessId, fromRow(data))
  audit.log({ userId, email, action: 'dump_truck.driver_credential.create', resource: 'fleet_driver_credentials', resourceId: credential.id, after: credential })
  return credential
}

export interface UpdateCredentialInput extends Partial<CreateCredentialInput> {
  active?: boolean
}

/** Driver corrects their own credential, or dispatch/admin corrects it on their behalf. Verification status changes go through verifyCredential instead. */
export async function updateDriverCredential(
  businessId: string, credentialId: string, input: UpdateCredentialInput, userId: string, email: string | null,
): Promise<DriverCredential> {
  const { data: existing } = await fleetServiceClient.from('fleet_driver_credentials').select('id, business_id').eq('id', credentialId).maybeSingle()
  if (!existing || existing.business_id !== businessId) throw new DumpTruckError('Credential not found', 404)

  const patch: Record<string, unknown> = {}
  if (input.label !== undefined) patch.label = input.label
  if (input.number !== undefined) patch.number = input.number
  if (input.issuingState !== undefined) patch.issuing_state = input.issuingState
  if (input.class !== undefined) patch.class = input.class
  if (input.endorsements !== undefined) patch.endorsements = input.endorsements
  if (input.restrictions !== undefined) patch.restrictions = input.restrictions
  if (input.issueDate !== undefined) patch.issue_date = input.issueDate
  if (input.expiryDate !== undefined) patch.expiry_date = input.expiryDate
  if (input.active !== undefined) patch.active = input.active

  const { data, error } = await fleetServiceClient.from('fleet_driver_credentials').update(patch).eq('id', credentialId).select('*').single()
  if (error) throw error
  const credential = await withSignedUrls(businessId, fromRow(data))
  audit.log({ userId, email, action: 'dump_truck.driver_credential.update', resource: 'fleet_driver_credentials', resourceId: credential.id, after: credential })
  return credential
}

/** Dispatch/admin marks a credential verified (or reverts to pending/unverified) after checking it against the photo. Not driver self-service. */
export async function verifyDriverCredential(
  businessId: string, credentialId: string, status: VerificationStatus, verifierId: string, email: string | null,
): Promise<DriverCredential> {
  const { data: existing } = await fleetServiceClient.from('fleet_driver_credentials').select('id, business_id').eq('id', credentialId).maybeSingle()
  if (!existing || existing.business_id !== businessId) throw new DumpTruckError('Credential not found', 404)

  const { data, error } = await fleetServiceClient
    .from('fleet_driver_credentials')
    .update({ verification_status: status, verified_by: verifierId, verified_at: new Date().toISOString() })
    .eq('id', credentialId)
    .select('*')
    .single()
  if (error) throw error
  const credential = await withSignedUrls(businessId, fromRow(data))
  audit.log({ userId: verifierId, email, action: 'dump_truck.driver_credential.verify', resource: 'fleet_driver_credentials', resourceId: credential.id, metadata: { status }, source: 'admin' })
  return credential
}

/** Uploads a front or back photo for a credential through the shared private-documents pipeline. */
export async function uploadCredentialPhoto(
  businessId: string, credentialId: string, side: 'front' | 'back',
  fileName: string, mimeType: string, bytes: Buffer, userId: string, email: string | null,
): Promise<DriverCredential> {
  const { data: existing } = await fleetServiceClient.from('fleet_driver_credentials').select('id, driver_id, business_id').eq('id', credentialId).maybeSingle()
  if (!existing || existing.business_id !== businessId) throw new DumpTruckError('Credential not found', 404)

  const doc = await uploadDocument({
    businessId, shiftId: null, docType: side === 'front' ? 'cdl_front' : 'cdl_back',
    linkedEntityType: 'driver_credential', linkedEntityId: credentialId,
    fileName, mimeType, bytes,
  }, userId, email)

  const { data, error } = await fleetServiceClient
    .from('fleet_driver_credentials')
    .update(side === 'front' ? { front_doc_id: doc.id } : { back_doc_id: doc.id })
    .eq('id', credentialId)
    .select('*')
    .single()
  if (error) throw error
  return withSignedUrls(businessId, fromRow(data))
}
