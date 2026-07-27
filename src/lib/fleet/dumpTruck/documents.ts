/**
 * fleet/dumpTruck/documents.ts — private document upload (photos, tickets, receipts)
 */

import { createHash } from 'node:crypto'
import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { DumpTruckError } from './shared'

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf'])
const MAX_BYTES = 25 * 1024 * 1024

export interface UploadDocumentInput {
  businessId: string
  shiftId: string | null
  docType: string
  linkedEntityType?: string | null
  linkedEntityId?: string | null
  fileName: string
  mimeType: string
  bytes: Buffer
  capturedAt?: string | null
  lat?: number | null
  lng?: number | null
}

export async function uploadDocument(
  input: UploadDocumentInput, userId: string, email: string | null,
): Promise<{ id: string; storagePath: string; duplicateOf: string | null }> {
  if (!ALLOWED_MIME.has(input.mimeType)) {
    throw new DumpTruckError(`Unsupported file type: ${input.mimeType}`, 400)
  }
  if (input.bytes.length > MAX_BYTES) {
    throw new DumpTruckError('File exceeds 25MB limit', 400)
  }

  const fileHash = createHash('sha256').update(input.bytes).digest('hex')

  const { data: existing } = await fleetServiceClient
    .from('fleet_dt_documents')
    .select('id, storage_path')
    .eq('business_id', input.businessId)
    .eq('file_hash', fileHash)
    .maybeSingle()

  if (existing) {
    return { id: existing.id, storagePath: existing.storage_path, duplicateOf: existing.id }
  }

  const objectId = crypto.randomUUID()
  const safeName = input.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_')
  const storagePath = `${input.businessId}/${input.shiftId ?? 'unlinked'}/${objectId}-${safeName}`

  const { error: uploadError } = await fleetServiceClient.storage
    .from('fleet-dt-documents')
    .upload(storagePath, input.bytes, { contentType: input.mimeType, upsert: false })
  if (uploadError) throw uploadError

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_documents')
    .insert({
      business_id: input.businessId,
      shift_id: input.shiftId,
      doc_type: input.docType,
      linked_entity_type: input.linkedEntityType ?? null,
      linked_entity_id: input.linkedEntityId ?? null,
      storage_path: storagePath,
      file_name: input.fileName,
      mime_type: input.mimeType,
      file_size_bytes: input.bytes.length,
      file_hash: fileHash,
      captured_at: input.capturedAt ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      uploaded_by: userId,
    })
    .select('id')
    .single()
  if (error) throw error

  audit.log({ userId, email, action: 'dump_truck.document.upload', resource: 'fleet_dt_documents', resourceId: data.id, metadata: { docType: input.docType } })

  return { id: data.id, storagePath, duplicateOf: null }
}

export async function getSignedDocumentUrl(businessId: string, documentId: string): Promise<string | null> {
  const { data: doc } = await fleetServiceClient
    .from('fleet_dt_documents')
    .select('storage_path, business_id')
    .eq('id', documentId)
    .single()
  if (!doc || doc.business_id !== businessId) return null

  const { data, error } = await fleetServiceClient.storage
    .from('fleet-dt-documents')
    .createSignedUrl(doc.storage_path, 300) // 5 min
  if (error) return null
  return data.signedUrl
}
