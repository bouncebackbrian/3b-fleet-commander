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
