/**
 * fleet/dumpTruck/ticketFinalize.ts — completed-ticket PDF + email (2026-07-30)
 *
 * Split out from ticketInstances.ts (which calls this via dynamic import) so
 * the signature/status state machine doesn't need to import the PDF engine
 * and email sender directly. Field VALUES are read live off fleet_dt_jobs
 * and fleet_dt_events here — never duplicated onto the ticket instance.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { getBusinessProfile, getBusinessLogoForPdf } from '@/lib/fleet/business'
import { getJobById } from './jobs'
import { TICKET_FIELD_CATALOG } from './ticketTemplates'
import { renderDispatchTicketPdf, type DispatchTicketSignature } from '@/lib/reports/pdf'
import { sendTicketEmail, type TicketEmailRecipient } from '@/lib/email/resend'
import type { TicketInstance } from './ticketInstances'

const DOCUMENTS_BUCKET = 'fleet-dt-documents'
const TICKETS_BUCKET = 'dispatch-tickets'

async function fetchProfileName(userId: string | null): Promise<string> {
  if (!userId) return '—'
  const { data } = await fleetServiceClient.from('profiles').select('full_name').eq('id', userId).maybeSingle()
  return data?.full_name || '—'
}

async function fetchTruckUnit(truckId: string | null): Promise<string | null> {
  if (!truckId) return null
  const { data } = await fleetServiceClient.from('fleet_equipment').select('unit_number').eq('id', truckId).maybeSingle()
  return data?.unit_number ?? null
}

async function fetchBrokerEmail(brokerId: string | null): Promise<string | null> {
  if (!brokerId) return null
  const { data } = await fleetServiceClient.from('fleet_brokers').select('email').eq('id', brokerId).maybeSingle()
  return data?.email ?? null
}

async function fetchSignature(docId: string | null, signedBy: string, signedAt: string | null): Promise<DispatchTicketSignature | null> {
  if (!docId || !signedAt) return null
  const { data: doc } = await fleetServiceClient.from('fleet_dt_documents').select('storage_path').eq('id', docId).maybeSingle()
  if (!doc) return null
  const { data, error } = await fleetServiceClient.storage.from(DOCUMENTS_BUCKET).download(doc.storage_path)
  if (error || !data) return null
  return { imageBytes: Buffer.from(await data.arrayBuffer()), signedBy, signedAt: new Date(signedAt).toLocaleString() }
}

export async function finalizeCompletedTicket(
  instance: TicketInstance, _userId: string, _email: string | null,
): Promise<void> {
  const job = await getJobById(instance.businessId, instance.jobId)
  if (!job) {
    console.error(`[ticketFinalize] ticket ${instance.id} completed but job ${instance.jobId} not found — skipping PDF`)
    return
  }

  const { data: templateRow } = await fleetServiceClient
    .from('fleet_dt_ticket_templates').select('field_keys').eq('id', instance.templateId ?? '').maybeSingle()
  const fieldKeys: string[] = Array.isArray(templateRow?.field_keys) ? templateRow.field_keys : TICKET_FIELD_CATALOG.map(f => f.key)

  const fields = TICKET_FIELD_CATALOG
    .filter(f => fieldKeys.includes(f.key))
    .map(f => ({ label: f.label, value: job[f.key] }))
    .filter(f => f.value != null && f.value !== '')
    .map(f => ({ label: f.label, value: String(f.value) }))
  if (job.signedOutAt) fields.push({ label: 'Signed Out At', value: new Date(job.signedOutAt).toLocaleString() })

  const { data: events } = await fleetServiceClient
    .from('fleet_dt_events')
    .select('event_type, effective_at, device_metadata')
    .eq('business_id', instance.businessId)
    .eq('job_id', instance.jobId)
    .order('effective_at', { ascending: true })

  const timeline = (events ?? []).map(e => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loadTag = (e.device_metadata as any)?.loadTag
    const loadTagLabel = loadTag
      ? [loadTag.ticketNumber ? `#${loadTag.ticketNumber}` : null, loadTag.netWeightTons != null ? `${loadTag.netWeightTons}t` : null].filter(Boolean).join(' ')
      : null
    return {
      time: new Date(e.effective_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      label: String(e.event_type).replace(/_/g, ' '),
      loadTag: loadTagLabel || null,
    }
  })

  const [profile, logo, driverName, truckUnit, companySignature, driverSignature] = await Promise.all([
    getBusinessProfile(instance.businessId),
    getBusinessLogoForPdf(instance.businessId),
    fetchProfileName(instance.driverId),
    fetchTruckUnit(job.truckId),
    fetchSignature(instance.companySignatureDocId, await fetchProfileName(instance.companySignedBy), instance.companySignedAt),
    fetchSignature(instance.driverSignatureDocId, await fetchProfileName(instance.driverId), instance.driverSignedAt),
  ])

  const pdfBytes = await renderDispatchTicketPdf({
    logoBytes: logo?.bytes ?? null,
    logoFormat: logo?.format,
    businessName: profile?.name ?? 'Fleet Commander',
    threeBBizId: profile?.threeBBizId ?? null,
    jobNumber: job.jobNumber,
    brokerName: job.brokerName,
    driverName,
    truckUnit,
    date: new Date().toLocaleDateString(),
    fields,
    timeline,
    companySignature,
    driverSignature,
  })

  const storagePath = `${instance.businessId}/${instance.id}.pdf`
  const { error: uploadError } = await fleetServiceClient.storage
    .from(TICKETS_BUCKET)
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true })
  if (uploadError) {
    console.error(`[ticketFinalize] ticket ${instance.id} PDF upload failed:`, uploadError)
    return
  }

  await fleetServiceClient.from('fleet_dt_ticket_instances').update({ pdf_storage_path: storagePath }).eq('id', instance.id)

  // Recipients: the company signer IS dispatch/admin (whoever confirmed
  // receipt), the driver signer, and the broker's directory email if this
  // job has one on file. Fleet's local `profiles` table doesn't reliably
  // carry email — identity/email is Core_Eco-owned (see
  // docs/SCHEMA_RECONCILIATION.md) — so each signer's email is captured at
  // the moment they sign (see signTicket()) rather than looked up here.
  const brokerEmail = await fetchBrokerEmail(job.brokerId)
  const recipients: TicketEmailRecipient[] = [
    instance.companySignedByEmail ? { email: instance.companySignedByEmail, label: 'dispatch' } : null,
    instance.driverSignedByEmail ? { email: instance.driverSignedByEmail, label: 'driver' } : null,
    brokerEmail ? { email: brokerEmail, label: 'broker' } : null,
  ].filter((r): r is TicketEmailRecipient => r != null)

  const result = await sendTicketEmail({
    recipients, businessName: profile?.name ?? 'Fleet Commander', jobNumber: job.jobNumber, pdfBytes,
  })
  if (result.sent) {
    await fleetServiceClient.from('fleet_dt_ticket_instances').update({ emailed_at: new Date().toISOString() }).eq('id', instance.id)
  } else {
    console.warn(`[ticketFinalize] ticket ${instance.id} PDF stored at ${storagePath} — email skipped: ${result.skippedReason ?? result.errors?.join('; ')}`)
  }
}
