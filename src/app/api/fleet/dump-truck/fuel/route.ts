/**
 * /api/fleet/dump-truck/fuel — create + list fuel entries (spec §9)
 *
 * POST accepts multipart/form-data: fuel fields + an optional receipt image
 * (uploaded through the existing fleet-dt-documents pipeline, doc_type
 * 'fuel_receipt', so duplicate-receipt detection via file hash applies).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { createFuelEntry, listFuelEntriesForShift } from '@/lib/fleet/dumpTruck/fuel'
import { uploadDocument } from '@/lib/fleet/dumpTruck/documents'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const shiftId = request.nextUrl.searchParams.get('shiftId')
  if (!shiftId) return NextResponse.json({ error: 'shiftId is required' }, { status: 400 })

  try {
    const entries = await listFuelEntriesForShift(auth.businessId, shiftId)
    return NextResponse.json({ entries })
  } catch (err) {
    console.error('[api/fleet/dump-truck/fuel] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const form = await request.formData()
    const field = (name: string) => {
      const v = form.get(name)
      return typeof v === 'string' && v.length ? v : null
    }
    const num = (name: string) => {
      const v = field(name)
      return v != null ? Number(v) : null
    }

    const vehicleId = field('vehicleId')
    const totalCostRaw = field('totalCost')
    if (!vehicleId) return NextResponse.json({ error: 'vehicleId is required' }, { status: 400 })
    if (!totalCostRaw) return NextResponse.json({ error: 'totalCost is required' }, { status: 400 })

    let receiptDocId: string | null = null
    const file = form.get('file')
    if (file instanceof File) {
      const bytes = Buffer.from(await file.arrayBuffer())
      const uploadResult = await uploadDocument({
        businessId: auth.businessId,
        shiftId: field('shiftId'),
        docType: 'fuel_receipt',
        fileName: file.name,
        mimeType: file.type,
        bytes,
        capturedAt: field('purchasedAt') ?? new Date().toISOString(),
        lat: num('lat'),
        lng: num('lng'),
      }, auth.userId, auth.email)
      receiptDocId = uploadResult.id
    }

    const result = await createFuelEntry(auth.businessId, auth.userId, auth.email, {
      shiftId: field('shiftId'),
      vehicleId,
      jobId: field('jobId'),
      vendorName: field('vendorName'),
      purchasedAt: field('purchasedAt') ?? new Date().toISOString(),
      lat: num('lat'),
      lng: num('lng'),
      locationAccuracyM: num('locationAccuracyM'),
      odometer: num('odometer'),
      fuelType: (field('fuelType') as 'diesel' | 'gasoline' | 'def' | 'reefer' | 'other') ?? 'diesel',
      gallons: num('gallons'),
      pricePerGallon: num('pricePerGallon'),
      totalCost: Number(totalCostRaw),
      tax: num('tax'),
      paymentMethod: field('paymentMethod'),
      fuelCardRef: field('fuelCardRef'),
      fullTank: field('fullTank') === 'true',
      receiptDocId,
      ocrMerchant: field('ocrMerchant'),
      ocrDate: field('ocrDate'),
      ocrGallons: num('ocrGallons'),
      ocrPricePerGallon: num('ocrPricePerGallon'),
      ocrTotal: num('ocrTotal'),
      ocrAddress: field('ocrAddress'),
      ocrConfidence: field('ocrConfidence') as 'high' | 'medium' | 'low' | null,
      driverVerified: field('driverVerified') === 'true',
      notes: field('notes'),
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/fuel] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
