/**
 * /api/integrations/geocode — Geocoding & Reverse Geocoding (server-side proxy)
 *
 * Proxies Google Geocoding API so keys stay server-side.
 *
 * GET /api/integrations/geocode?address=...
 * GET /api/integrations/geocode?lat=...&lng=...
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'

export const dynamic = 'force-dynamic'

function getApiKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY ?? ''
}

export async function GET(req: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = getApiKey()
  const { searchParams } = req.nextUrl
  const address = searchParams.get('address')
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  // If no Google Maps API key, fall back to Nominatim (OSM)
  if (!apiKey) {
    if (address) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
        const data = await res.json()
        if (data?.[0]) {
          return NextResponse.json({
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            formattedAddress: data[0].display_name,
          })
        }
        return NextResponse.json({ error: 'Address not found' }, { status: 404 })
      } catch {
        return NextResponse.json({ error: 'Geocoding failed' }, { status: 502 })
      }
    }
    return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not configured. Use address param with free tier.' }, { status: 503 })
  }

  try {
    if (address) {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.status !== 'OK' || !data.results?.[0]) {
        return NextResponse.json({ error: 'Address not found' }, { status: 404 })
      }
      const r = data.results[0]
      return NextResponse.json({
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
        formattedAddress: r.formatted_address,
        components: r.address_components?.map((c: Record<string, unknown>) => ({
          longName: c.long_name,
          shortName: c.short_name,
          types: c.types,
        })),
      })
    }

    if (lat && lng) {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.status !== 'OK' || !data.results?.[0]) {
        return NextResponse.json({ error: 'Location not found' }, { status: 404 })
      }
      const r = data.results[0]
      return NextResponse.json({
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
        formattedAddress: r.formatted_address,
        components: r.address_components?.map((c: Record<string, unknown>) => ({
          longName: c.long_name,
          shortName: c.short_name,
          types: c.types,
        })),
      })
    }

    return NextResponse.json({ error: 'Provide address or lat+lng' }, { status: 400 })
  } catch (err) {
    console.error('[api/integrations/geocode] Error:', err)
    return NextResponse.json({ error: 'Geocoding request failed' }, { status: 502 })
  }
}