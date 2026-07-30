/**
 * fleet/dumpTruck/ticketInstances.ts — one digital dispatch ticket per job (2026-07-30)
 *
 * Created automatically when dispatch accepts a job (see acceptJob() in
 * jobs.ts). Field values are never copied here — the ticket always reads
 * fleet_dt_jobs live at render time. This module owns the signature/status
 * state machine; PDF rendering + email delivery are wired in via
 * finalizeTicket(), filled in once the PDF engine (reports/pdf.tsx) and
 * email sender (lib/email/resend.ts) exist — see their own modules.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { getEffectiveTemplate, type TicketTemplate } from './ticketTemplates'

export interface TicketInstance {
  id: string
  businessId: string
  jobId: string
  templateId: string | null
  driverId: string | null
  brokerId: string | null
  status: 'active' | 'company_signed' | 'driver_signed' | 'completed'
  companySignatureDocId: string | null
  companySignedBy: string | null
  companySignedAt: string | null
  companySignedByEmail: string | null
  driverSignatureDocId: string | null
  driverSignedAt: string | null
  driverSignedByEmail: string | null
  pdfStoragePath: string | null
  emailedAt: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): TicketInstance {
  return {
    id: r.id, businessId: r.business_id, jobId: r.job_id, templateId: r.template_id,
    driverId: r.driver_id, brokerId: r.broker_id, status: r.status,
    companySignatureDocId: r.company_signature_doc_id, companySignedBy: r.company_signed_by, companySignedAt: r.company_signed_at,
    companySignedByEmail: r.company_signed_by_email,
    driverSignatureDocId: r.driver_signature_doc_id, driverSignedAt: r.driver_signed_at,
    driverSignedByEmail: r.driver_signed_by_email,
    pdfStoragePath: r.pdf_storage_path, emailedAt: r.emailed_at,
  }
}

/** Auto-created when dispatch accepts a job (acceptJob() in jobs.ts) — idempotent, safe to call more than once. */
export async function createTicketInstance(
  businessId: string, jobId: string, driverId: string | null, brokerId: string | null,
): Promise<TicketInstance> {
  const { data: existing } = await fleetServiceClient
    .from('fleet_dt_ticket_instances').select('*').eq('job_id', jobId).maybeSingle()
  if (existing) return fromRow(existing)

  const template = await getEffectiveTemplate(businessId, brokerId)

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_ticket_instances')
    .insert({ business_id: businessId, job_id: jobId, template_id: template.id, driver_id: driverId, broker_id: brokerId })
    .select('*')
    .single()
  if (error) throw error
  return fromRow(data)
}

export async function getTicketInstanceByJob(businessId: string, jobId: string): Promise<TicketInstance | null> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_ticket_instances').select('*').eq('business_id', businessId).eq('job_id', jobId).maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

export async function getTicketInstanceById(businessId: string, id: string): Promise<TicketInstance | null> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_ticket_instances').select('*').eq('business_id', businessId).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

function computeStatus(template: TicketTemplate, companySigned: boolean, driverSigned: boolean): TicketInstance['status'] {
  const companyDone = !template.requiresCompanySignoff || companySigned
  const driverDone = !template.requiresDriverSignature || driverSigned
  if (companyDone && driverDone) return 'completed'
  if (companySigned) return 'company_signed'
  if (driverSigned) return 'driver_signed'
  return 'active'
}

/**
 * Attach a signature (company sign-off, or driver completion) and advance
 * status. When this completes the ticket (both required signatures now
 * present), triggers PDF render + storage + email — see finalizeTicket()
 * below.
 */
export async function signTicket(
  businessId: string, ticketId: string, role: 'company' | 'driver', signatureDocId: string, signedByUserId: string, email: string | null,
): Promise<TicketInstance> {
  const instance = await getTicketInstanceById(businessId, ticketId)
  if (!instance) throw new Error('Ticket not found')

  const { data: templateRow } = await fleetServiceClient
    .from('fleet_dt_ticket_templates').select('*').eq('id', instance.templateId ?? '').maybeSingle()
  const template: TicketTemplate = templateRow
    ? {
        id: templateRow.id, businessId: templateRow.business_id, brokerId: templateRow.broker_id, name: templateRow.name,
        fieldKeys: templateRow.field_keys ?? [], requiresCompanySignoff: templateRow.requires_company_signoff,
        requiresDriverSignature: templateRow.requires_driver_signature, referenceScanDocId: templateRow.reference_scan_doc_id,
      }
    : { id: '', businessId, brokerId: null, name: '', fieldKeys: [], requiresCompanySignoff: true, requiresDriverSignature: true, referenceScanDocId: null }

  const patch: Record<string, unknown> = {}
  if (role === 'company') {
    patch.company_signature_doc_id = signatureDocId
    patch.company_signed_by = signedByUserId
    patch.company_signed_at = new Date().toISOString()
    patch.company_signed_by_email = email
  } else {
    patch.driver_signature_doc_id = signatureDocId
    patch.driver_signed_at = new Date().toISOString()
    patch.driver_signed_by_email = email
  }

  const companySigned = role === 'company' ? true : instance.companySignatureDocId != null
  const driverSigned = role === 'driver' ? true : instance.driverSignatureDocId != null
  patch.status = computeStatus(template, companySigned, driverSigned)

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_ticket_instances').update(patch).eq('id', ticketId).select('*').single()
  if (error) throw error

  const updated = fromRow(data)
  audit.log({
    userId: signedByUserId, email, action: `dump_truck.ticket.${role}_sign`, resource: 'fleet_dt_ticket_instances',
    resourceId: ticketId, metadata: { jobId: instance.jobId, status: updated.status },
  })

  if (updated.status === 'completed') {
    await finalizeTicket(updated, signedByUserId, email)
  }

  return updated
}

/**
 * Render the ticket PDF, store it, and email it out. Filled in below once
 * the PDF engine and email sender exist (this function's body is the one
 * piece of this module deliberately left as a stage boundary — see
 * src/lib/reports/pdf.tsx's renderDispatchTicketPdf and
 * src/lib/email/resend.ts's sendTicketEmail).
 */
async function finalizeTicket(instance: TicketInstance, userId: string, email: string | null): Promise<void> {
  const { finalizeCompletedTicket } = await import('./ticketFinalize')
  await finalizeCompletedTicket(instance, userId, email)
}
