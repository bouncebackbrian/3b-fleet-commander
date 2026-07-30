/**
 * lib/email/resend.ts — real outbound email via Resend (2026-07-30)
 *
 * The only other "email" mechanism in this app (notificationRouter.ts) fires
 * at a user-configured, client-exposed webhook URL with no delivery
 * guarantee — chosen not to extend that for dispatch ticket delivery.
 * Requires RESEND_API_KEY (free tier at resend.com) — until it's set,
 * sendTicketEmail() is a documented no-op: the PDF/storage/download path
 * still works fully, this just skips the "and also email it" step rather
 * than silently pretending to succeed.
 */

import { Resend } from 'resend'

export interface TicketEmailRecipient {
  email: string
  label: string
}

export interface SendTicketEmailInput {
  recipients: TicketEmailRecipient[]
  businessName: string
  jobNumber: string
  pdfBytes: Buffer
}

export interface SendTicketEmailResult {
  sent: boolean
  skippedReason?: string
  errors?: string[]
}

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || 'Fleet Commander <onboarding@resend.dev>'

export async function sendTicketEmail(input: SendTicketEmailInput): Promise<SendTicketEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email/resend] RESEND_API_KEY not configured — skipping dispatch ticket email')
    return { sent: false, skippedReason: 'RESEND_API_KEY not configured' }
  }

  const to = [...new Set(input.recipients.map(r => r.email).filter(Boolean))]
  if (to.length === 0) {
    return { sent: false, skippedReason: 'No recipient email addresses on file for this ticket' }
  }

  const resend = new Resend(apiKey)
  const errors: string[] = []

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `${input.businessName} — Dispatch Ticket ${input.jobNumber} Complete`,
      html: `<p>The digital dispatch ticket for job <strong>${input.jobNumber}</strong> is complete — both signatures are on file. The signed PDF is attached.</p>`,
      attachments: [{ filename: `dispatch-ticket-${input.jobNumber}.pdf`, content: input.pdfBytes.toString('base64') }],
    })
    if (error) errors.push(error.message)
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Unknown error sending email')
  }

  if (errors.length > 0) {
    console.error('[email/resend] sendTicketEmail failed:', errors)
    return { sent: false, errors }
  }
  return { sent: true }
}

export interface SendDefectAlertEmailInput {
  to: string
  businessName: string
  truckUnit: string | null
  driverName: string
  severity: 'monitor' | 'non_safety' | 'safety_critical' | 'out_of_service'
  description: string
  reportedAt: string
  photo?: { bytes: Buffer; mimeType: string } | null
  lat?: number | null
  lng?: number | null
}

const SEVERITY_LABELS: Record<SendDefectAlertEmailInput['severity'], string> = {
  monitor: 'MONITOR', non_safety: 'NON-SAFETY', safety_critical: 'SAFETY-CRITICAL', out_of_service: 'OUT OF SERVICE',
}

/** Fired immediately when a driver reports a defect — see reportQuickDefect() and completeInspection(). */
export async function sendDefectAlertEmail(input: SendDefectAlertEmailInput): Promise<SendTicketEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email/resend] RESEND_API_KEY not configured — skipping defect alert email')
    return { sent: false, skippedReason: 'RESEND_API_KEY not configured' }
  }
  if (!input.to) {
    return { sent: false, skippedReason: 'No dispatch alert email configured on this business' }
  }

  const resend = new Resend(apiKey)
  const severityLabel = SEVERITY_LABELS[input.severity]
  const attachments = input.photo
    ? [{ filename: `defect-photo.${input.photo.mimeType.split('/')[1] ?? 'jpg'}`, content: input.photo.bytes.toString('base64') }]
    : undefined
  const mapsUrl = input.lat != null && input.lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${input.lat},${input.lng}&travelmode=driving`
    : null

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [input.to],
      subject: `⚠️ ${severityLabel} defect — ${input.truckUnit ?? 'truck'} — ${input.businessName}`,
      html: `
        <p><strong>${severityLabel}</strong> defect reported by ${input.driverName} on truck ${input.truckUnit ?? 'unknown'}.</p>
        <p>${input.description}</p>
        ${mapsUrl ? `<p><a href="${mapsUrl}">📍 Open driver's location in Google Maps</a> — forward this to whoever you send to handle it (tow, mobile tire tech, etc.)</p>` : ''}
        <p style="color:#666">Reported ${new Date(input.reportedAt).toLocaleString()}${input.photo ? ' — photo attached' : ''}</p>
      `,
      attachments,
    })
    if (error) {
      console.error('[email/resend] sendDefectAlertEmail failed:', error.message)
      return { sent: false, errors: [error.message] }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error sending email'
    console.error('[email/resend] sendDefectAlertEmail failed:', message)
    return { sent: false, errors: [message] }
  }
  return { sent: true }
}
