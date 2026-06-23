/**
 * /api/fuel/scan-receipt — Fuel Receipt OCR (Priority 3)
 *
 * Accepts a fuel receipt image, processes with OCR (Anthropic Claude Vision),
 * extracts structured data (gallons, price, location, date, odometer),
 * and optionally saves to the fleet fuel_entries table.
 *
 * POST multipart/form-data with 'file' field (image) and optional 'save' (boolean)
 */

import { NextRequest, NextResponse } from 'next/server'
import { ocr } from '@/lib/integrations/ocr'

export const dynamic = 'force-dynamic'
export const maxDuration = 30 // Receipt OCR can take a few seconds

export async function POST(req: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────────────
  // Use existing fleet auth guard
  const { requireFleetAuth } = await import('@/lib/fleet-auth-guard')
  const auth = await requireFleetAuth()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Check OCR availability ─────────────────────────────────────────────────
  if (!ocr.isConfigured) {
    return NextResponse.json(
      { error: 'OCR is not configured. Set ANTHROPIC_API_KEY in environment.' },
      { status: 503 },
    )
  }

  // ── Parse form data ─────────────────────────────────────────────────────────
  let file: File | null = null
  let saveToDb = false
  try {
    const form = await req.formData()
    file = form.get('file') as File | null
    saveToDb = form.get('save') === 'true'
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  if (!file) {
    return NextResponse.json({ error: 'No file provided. Upload a receipt image.' }, { status: 400 })
  }

  // ── Process with OCR ────────────────────────────────────────────────────────
  const result = await ocr.processFuelReceipt(file)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error, raw: result.raw },
      { status: 422 },
    )
  }

  // ── Optionally save to database ─────────────────────────────────────────────
  let savedEntry = null
  if (saveToDb && result.data) {
    try {
      const { createFuelEntry } = await import('@/lib/fleet/fuel')
      const d = result.data
      savedEntry = await createFuelEntry(
        {
          date: d.date ?? new Date().toISOString().split('T')[0],
          location: [d.fuelStopName, d.city, d.state].filter(Boolean).join(', ') || 'Unknown',
          fuelType: mapFuelType(d.fuelType),
          gallons: d.gallons ?? 0,
          pricePerGal: d.pricePerGal ?? undefined,
          totalCost: d.totalCost ?? 0,
          notes: [d.odometer ? `Odometer: ${d.odometer}` : '', d.notes ?? '']
            .filter(Boolean).join(' | '),
        },
        auth.userId,
        auth.email,
      )
    } catch (err) {
      console.error('[api/fuel/scan-receipt] Save error:', err)
      // Don't fail the request — the scan succeeded even if save failed
    }
  }

  return NextResponse.json({
    success: true,
    data: result.data,
    saved: !!savedEntry,
    entry: savedEntry,
  })
}

/**
 * Map OCR fuel type to the app's fuel type enum.
 */
function mapFuelType(type: string | null): string {
  switch ((type ?? '').toLowerCase()) {
    case 'diesel':
    case 'tractor':
      return 'Tractor'
    case 'def':
      return 'DEF'
    case 'reefer':
      return 'Reefer'
    default:
      return 'Tractor'
  }
}

/**
 * GET — health check / info endpoint.
 */
export async function GET() {
  return NextResponse.json({
    configured: ocr.isConfigured,
    endpoint: 'Fuel Receipt OCR',
    version: '1.0.0',
  })
}