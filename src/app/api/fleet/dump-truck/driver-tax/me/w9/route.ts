/**
 * POST /api/fleet/dump-truck/driver-tax/me/w9 — the signed-in driver
 * submits their own W-9 (multipart/form-data). Thin wrapper around the
 * same logic as the admin [driverId]/w9 route, scoped to auth.userId.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { uploadDocument } from '@/lib/fleet/dumpTruck/documents'
import { submitW9 } from '@/lib/fleet/dumpTruck/driverTax'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const form = await request.formData()
    const signature = form.get('signature')
    const legalName = form.get('legalName')
    const federalTaxClassification = form.get('federalTaxClassification')
    const addressLine1 = form.get('addressLine1')
    const city = form.get('city')
    const state = form.get('state')
    const postalCode = form.get('postalCode')
    const tin = form.get('tin')
    const tinType = form.get('tinType')

    if (
      !(signature instanceof File) || typeof legalName !== 'string' || !legalName.trim()
      || typeof federalTaxClassification !== 'string'
      || typeof addressLine1 !== 'string' || typeof city !== 'string' || typeof state !== 'string' || typeof postalCode !== 'string'
      || typeof tin !== 'string' || !tin.trim() || (tinType !== 'ssn' && tinType !== 'ein')
    ) {
      return NextResponse.json({ error: 'legalName, federalTaxClassification, address, tin, tinType, and a signature are required' }, { status: 400 })
    }

    const sigBytes = Buffer.from(await signature.arrayBuffer())
    const doc = await uploadDocument({
      businessId: auth.businessId, shiftId: null, docType: 'signature',
      linkedEntityType: 'driver_tax_profile', linkedEntityId: auth.userId,
      fileName: `w9-signature-${auth.userId}.png`, mimeType: signature.type || 'image/png', bytes: sigBytes,
      capturedAt: new Date().toISOString(),
    }, auth.userId, auth.email)

    const businessName = form.get('businessName')
    const profile = await submitW9(auth.businessId, auth.userId, {
      legalName: legalName.trim(),
      businessName: typeof businessName === 'string' && businessName.trim() ? businessName.trim() : null,
      federalTaxClassification,
      addressLine1, city, state, postalCode,
      tin: tin.trim(), tinType,
      signatureDocId: doc.id,
    }, auth.userId, auth.email)

    return NextResponse.json({ profile })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/driver-tax/me/w9] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
