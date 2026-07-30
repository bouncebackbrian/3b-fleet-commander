/**
 * fleet/dumpTruck/driverTax.ts — driver 1099/W-2 classification, W-9, Form 1099-NEC (2026-07-30)
 *
 * TIN handling: listDriverTaxProfiles() (admin table view) never returns
 * the TIN, only whether one is on file — full TIN is only returned by
 * getDriverTaxProfile() (single-record admin/self fetch) and used
 * server-side when rendering the 1099 PDF. Never included in audit.log
 * metadata.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { getBusinessProfile } from '@/lib/fleet/business'
import { renderForm1099NecPdf } from '@/lib/tax/form1099nec'
import { DumpTruckError } from './shared'

export interface DriverTaxProfile {
  driverId: string
  classification: 'w2' | '1099'
  withholdingPercent: number | null
  legalName: string | null
  businessName: string | null
  federalTaxClassification: string | null
  addressLine1: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  tin: string | null
  tinType: 'ssn' | 'ein' | null
  w9SignedAt: string | null
}

export interface DriverTaxSummary {
  driverId: string
  classification: 'w2' | '1099'
  withholdingPercent: number | null
  hasW9: boolean
  w9SignedAt: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): DriverTaxProfile {
  return {
    driverId: r.driver_id, classification: r.classification,
    withholdingPercent: r.withholding_percent != null ? Number(r.withholding_percent) : null,
    legalName: r.legal_name, businessName: r.business_name, federalTaxClassification: r.federal_tax_classification,
    addressLine1: r.address_line1, city: r.city, state: r.state, postalCode: r.postal_code,
    tin: r.tin, tinType: r.tin_type, w9SignedAt: r.w9_signed_at,
  }
}

/** Admin table view — never includes TIN, just whether a W-9 is on file. */
export async function listDriverTaxProfiles(businessId: string): Promise<DriverTaxSummary[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_driver_tax_profiles')
    .select('driver_id, classification, withholding_percent, tin, w9_signed_at')
    .eq('business_id', businessId)
  if (error) throw error
  return (data ?? []).map(r => ({
    driverId: r.driver_id, classification: r.classification,
    withholdingPercent: r.withholding_percent != null ? Number(r.withholding_percent) : null,
    hasW9: !!r.tin, w9SignedAt: r.w9_signed_at,
  }))
}

export async function getDriverTaxProfile(businessId: string, driverId: string): Promise<DriverTaxProfile | null> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_driver_tax_profiles')
    .select('*')
    .eq('business_id', businessId)
    .eq('driver_id', driverId)
    .maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

export interface UpdateClassificationInput {
  classification: 'w2' | '1099'
  withholdingPercent?: number | null
}

/** Admin-only — sets whether a driver is paid as a 1099 contractor and their withholding suggestion %. */
export async function updateDriverClassification(
  businessId: string, driverId: string, input: UpdateClassificationInput, userId: string, email: string | null,
): Promise<DriverTaxProfile> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_driver_tax_profiles')
    .upsert({
      business_id: businessId, driver_id: driverId,
      classification: input.classification,
      withholding_percent: input.withholdingPercent ?? null,
      updated_by: userId,
    }, { onConflict: 'business_id,driver_id' })
    .select('*')
    .single()
  if (error) throw error

  audit.log({
    userId, email, action: 'dump_truck.driver_tax.classification_update', resource: 'fleet_dt_driver_tax_profiles',
    metadata: { driverId, classification: input.classification },
  })
  return fromRow(data)
}

export interface SubmitW9Input {
  legalName: string
  businessName?: string | null
  federalTaxClassification: string
  addressLine1: string
  city: string
  state: string
  postalCode: string
  tin: string
  tinType: 'ssn' | 'ein'
  signatureDocId: string
}

/** Driver self-submits their own W-9 (or admin fills it in on their behalf). */
export async function submitW9(
  businessId: string, driverId: string, input: SubmitW9Input, userId: string, email: string | null,
): Promise<DriverTaxProfile> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_driver_tax_profiles')
    .upsert({
      business_id: businessId, driver_id: driverId,
      legal_name: input.legalName, business_name: input.businessName ?? null,
      federal_tax_classification: input.federalTaxClassification,
      address_line1: input.addressLine1, city: input.city, state: input.state, postal_code: input.postalCode,
      tin: input.tin, tin_type: input.tinType,
      w9_signature_doc_id: input.signatureDocId, w9_signed_at: new Date().toISOString(),
      updated_by: userId,
    }, { onConflict: 'business_id,driver_id' })
    .select('*')
    .single()
  if (error) throw error

  // Deliberately no TIN in audit metadata.
  audit.log({ userId, email, action: 'dump_truck.driver_tax.w9_submitted', resource: 'fleet_dt_driver_tax_profiles', metadata: { driverId } })
  return fromRow(data)
}

/** Sum of amounts actually paid (paid_at) within a calendar year — cash-basis, matching how 1099-NEC reporting works. */
export async function computeAnnualCompensation(businessId: string, driverId: string, taxYear: number): Promise<number> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_payroll_payments')
    .select('amount_paid, paid_at')
    .eq('business_id', businessId)
    .eq('driver_id', driverId)
    .gte('paid_at', `${taxYear}-01-01`)
    .lt('paid_at', `${taxYear + 1}-01-01`)
  if (error) throw error
  return (data ?? []).reduce((sum, r) => sum + (r.amount_paid != null ? Number(r.amount_paid) : 0), 0)
}

export interface Fleet1099Filing {
  id: string
  driverId: string
  taxYear: number
  totalCompensation: number
  pdfStoragePath: string | null
  generatedAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filingFromRow(r: any): Fleet1099Filing {
  return {
    id: r.id, driverId: r.driver_id, taxYear: r.tax_year,
    totalCompensation: Number(r.total_compensation), pdfStoragePath: r.pdf_storage_path, generatedAt: r.generated_at,
  }
}

export async function listFilings(businessId: string, driverId?: string): Promise<Fleet1099Filing[]> {
  let query = fleetServiceClient.from('fleet_dt_1099_filings').select('*').eq('business_id', businessId)
  if (driverId) query = query.eq('driver_id', driverId)
  const { data, error } = await query.order('tax_year', { ascending: false })
  if (error) throw error
  return (data ?? []).map(filingFromRow)
}

const BUCKET = 'fleet-dt-1099-forms'

/**
 * Renders and stores Copy B/C for a driver's tax year. Requires the driver
 * be classified '1099' with a W-9 (legal name + TIN) on file — otherwise
 * there's nothing correct to put on the form.
 */
export async function generate1099(
  businessId: string, driverId: string, taxYear: number, driverDisplayName: string, userId: string, email: string | null,
): Promise<Fleet1099Filing> {
  const [profile, taxProfile] = await Promise.all([
    getBusinessProfile(businessId),
    getDriverTaxProfile(businessId, driverId),
  ])
  if (!profile) throw new DumpTruckError('Business profile not found', 404)
  if (!taxProfile || taxProfile.classification !== '1099') {
    throw new DumpTruckError('Driver is not classified as a 1099 contractor', 400)
  }
  if (!taxProfile.tin || !taxProfile.legalName) {
    throw new DumpTruckError('Driver has not submitted a W-9 yet — legal name and TIN are required to generate a 1099', 400)
  }

  const totalCompensation = await computeAnnualCompensation(businessId, driverId, taxYear)

  const pdfBytes = await renderForm1099NecPdf({
    taxYear,
    payerName: profile.name,
    payerEin: profile.ein,
    payerAddress: { line1: profile.addressLine1 ?? null, city: profile.city ?? null, state: profile.state ?? null, postalCode: profile.postalCode ?? null },
    recipientName: taxProfile.legalName,
    recipientTin: taxProfile.tin,
    recipientTinType: taxProfile.tinType,
    recipientAddress: { line1: taxProfile.addressLine1, city: taxProfile.city, state: taxProfile.state, postalCode: taxProfile.postalCode },
    nonemployeeCompensation: totalCompensation,
  })

  const storagePath = `${businessId}/${driverId}/${taxYear}.pdf`
  const { error: uploadError } = await fleetServiceClient.storage
    .from(BUCKET)
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true })
  if (uploadError) throw uploadError

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_1099_filings')
    .upsert({
      business_id: businessId, driver_id: driverId, tax_year: taxYear,
      total_compensation: totalCompensation, pdf_storage_path: storagePath, generated_by: userId,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,driver_id,tax_year' })
    .select('*')
    .single()
  if (error) throw error

  audit.log({
    userId, email, action: 'dump_truck.driver_tax.1099_generated', resource: 'fleet_dt_1099_filings',
    metadata: { driverId, driverDisplayName, taxYear, totalCompensation },
  })
  return filingFromRow(data)
}

/**
 * `requesterDriverId` — pass null for an admin (authorized for any filing in
 * the business); pass the caller's own user id otherwise, and the filing
 * must belong to that same driver — a 1099 contains another person's TIN,
 * so any business member should NOT be able to fetch anyone's filing.
 */
export async function getFilingSignedUrl(businessId: string, filingId: string, requesterDriverId: string | null): Promise<string | null> {
  const { data: filing } = await fleetServiceClient
    .from('fleet_dt_1099_filings').select('pdf_storage_path, business_id, driver_id').eq('id', filingId).maybeSingle()
  if (!filing || filing.business_id !== businessId || !filing.pdf_storage_path) return null
  if (requesterDriverId != null && filing.driver_id !== requesterDriverId) return null

  const { data, error } = await fleetServiceClient.storage.from(BUCKET).createSignedUrl(filing.pdf_storage_path, 300)
  if (error) return null
  return data.signedUrl
}
