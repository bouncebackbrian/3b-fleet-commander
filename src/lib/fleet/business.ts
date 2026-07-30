/**
 * fleet/business.ts — business profile + logo (2026-07-29)
 *
 * The businesses table has had dot_number/mc_number/ein/insurance_* columns
 * with nowhere in the app to edit them, and no logo — this is the first
 * service/UI to expose them. The logo is consumed server-side by the
 * branded-report PDF engine (src/lib/reports/pdf.tsx), so this module
 * downloads raw bytes rather than issuing a signed URL — no need for a
 * browser-facing link.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

const LOGO_BUCKET = 'business-assets'
// png/jpeg only — the PDF report engine (@react-pdf/renderer) only reliably
// embeds those two formats; webp would silently fail to render in PDFs.
const ALLOWED_LOGO_MIME = new Set(['image/png', 'image/jpeg'])
const MAX_LOGO_BYTES = 5 * 1024 * 1024

export interface BusinessProfile {
  id: string
  name: string
  dotNumber: string | null
  mcNumber: string | null
  ein: string | null
  insuranceCarrier: string | null
  insurancePolicyNumber: string | null
  insuranceExpiry: string | null
  threeBBizId: string | null
  logoStoragePath: string | null
  /** Where safety-critical/out-of-service defect alerts get emailed — see lib/email/resend.ts. Null = alerts skipped. */
  dispatchAlertEmail: string | null
  /** Payer mailing address on Form 1099-NEC — see lib/fleet/dumpTruck/driverTax.ts. */
  addressLine1: string | null
  city: string | null
  state: string | null
  postalCode: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): BusinessProfile {
  return {
    id: r.id,
    name: r.name,
    dotNumber: r.dot_number,
    mcNumber: r.mc_number,
    ein: r.ein,
    insuranceCarrier: r.insurance_carrier,
    insurancePolicyNumber: r.insurance_policy_number,
    insuranceExpiry: r.insurance_expiry,
    threeBBizId: r.three_b_biz_id,
    logoStoragePath: r.logo_storage_path,
    dispatchAlertEmail: r.dispatch_alert_email,
    addressLine1: r.address_line1,
    city: r.city,
    state: r.state,
    postalCode: r.postal_code,
  }
}

const PROFILE_COLUMNS = 'id, name, dot_number, mc_number, ein, insurance_carrier, insurance_policy_number, insurance_expiry, three_b_biz_id, logo_storage_path, dispatch_alert_email, address_line1, city, state, postal_code'

export async function getBusinessProfile(businessId: string): Promise<BusinessProfile | null> {
  const { data, error } = await fleetServiceClient
    .from('businesses')
    .select(PROFILE_COLUMNS)
    .eq('id', businessId)
    .maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

export interface UpdateBusinessProfileInput {
  name?: string
  dotNumber?: string | null
  mcNumber?: string | null
  ein?: string | null
  insuranceCarrier?: string | null
  insurancePolicyNumber?: string | null
  insuranceExpiry?: string | null
  dispatchAlertEmail?: string | null
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
}

export async function updateBusinessProfile(
  businessId: string, input: UpdateBusinessProfileInput, userId: string, email: string | null,
): Promise<BusinessProfile> {
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.dotNumber !== undefined) patch.dot_number = input.dotNumber
  if (input.mcNumber !== undefined) patch.mc_number = input.mcNumber
  if (input.ein !== undefined) patch.ein = input.ein
  if (input.insuranceCarrier !== undefined) patch.insurance_carrier = input.insuranceCarrier
  if (input.insurancePolicyNumber !== undefined) patch.insurance_policy_number = input.insurancePolicyNumber
  if (input.insuranceExpiry !== undefined) patch.insurance_expiry = input.insuranceExpiry
  if (input.dispatchAlertEmail !== undefined) patch.dispatch_alert_email = input.dispatchAlertEmail
  if (input.addressLine1 !== undefined) patch.address_line1 = input.addressLine1
  if (input.city !== undefined) patch.city = input.city
  if (input.state !== undefined) patch.state = input.state
  if (input.postalCode !== undefined) patch.postal_code = input.postalCode

  const { data, error } = await fleetServiceClient
    .from('businesses')
    .update(patch)
    .eq('id', businessId)
    .select(PROFILE_COLUMNS)
    .single()
  if (error) throw error

  const profile = fromRow(data)
  audit.log({ userId, email, action: 'business.profile.update', resource: 'businesses', resourceId: businessId, after: profile })
  return profile
}

export async function uploadBusinessLogo(
  businessId: string, fileName: string, mimeType: string, bytes: Buffer, userId: string, email: string | null,
): Promise<{ logoStoragePath: string }> {
  if (!ALLOWED_LOGO_MIME.has(mimeType)) {
    throw new DumpTruckError(`Unsupported image type: ${mimeType}`, 400)
  }
  if (bytes.length > MAX_LOGO_BYTES) {
    throw new DumpTruckError('Logo image exceeds 5MB limit', 400)
  }

  const ext = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const storagePath = `${businessId}/logo-${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await fleetServiceClient.storage
    .from(LOGO_BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false })
  if (uploadError) throw uploadError

  const { error } = await fleetServiceClient
    .from('businesses')
    .update({ logo_storage_path: storagePath })
    .eq('id', businessId)
  if (error) throw error

  audit.log({ userId, email, action: 'business.logo.upload', resource: 'businesses', resourceId: businessId, metadata: { storagePath } })
  return { logoStoragePath: storagePath }
}

/** Short-lived signed URL — used only for the Settings-page logo preview. */
export async function getBusinessLogoSignedUrl(businessId: string): Promise<string | null> {
  const profile = await getBusinessProfile(businessId)
  if (!profile?.logoStoragePath) return null

  const { data, error } = await fleetServiceClient.storage
    .from(LOGO_BUCKET)
    .createSignedUrl(profile.logoStoragePath, 300)
  if (error || !data) return null
  return data.signedUrl
}

/** Raw bytes for server-side embedding (PDF generation) — no signed URL needed. */
export async function getBusinessLogoBytes(businessId: string): Promise<Buffer | null> {
  const profile = await getBusinessProfile(businessId)
  if (!profile?.logoStoragePath) return null

  const { data, error } = await fleetServiceClient.storage
    .from(LOGO_BUCKET)
    .download(profile.logoStoragePath)
  if (error || !data) return null

  return Buffer.from(await data.arrayBuffer())
}

/** Bytes + format ('png'|'jpg') for the PDF engine's <Image> component. */
export async function getBusinessLogoForPdf(businessId: string): Promise<{ bytes: Buffer; format: 'png' | 'jpg' } | null> {
  const profile = await getBusinessProfile(businessId)
  if (!profile?.logoStoragePath) return null
  const bytes = await getBusinessLogoBytes(businessId)
  if (!bytes) return null
  const format = profile.logoStoragePath.toLowerCase().endsWith('.png') ? 'png' : 'jpg'
  return { bytes, format }
}
