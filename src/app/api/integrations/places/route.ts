/**
 * /api/integrations/places — Google Maps Places (server-side proxy)
 *
 * Proxies Google Places API calls so the API key stays server-side.
 * Supports:
 *   - Nearby search (find truck stops, fuel stations, rest areas)
 *   - Place details
 *   - Text search (find places by name)
 *
 * GET /api/integrations/places?search=...&lat=...&lng=...&type=...&radius=...
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'

export const dynamic = 'force-dynamic'

const API_KEY_VAR = 'GOOGLE_MAPS_API_KEY'
const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place'

function getApiKey(): string {
  return process.env[API_KEY_VAR] ?? ''
}

/**
 * GET — search nearby places or text search
 */
export async function GET(req: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = getApiKey()
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not configured' }, { status: 503 })
  }

  const { searchParams } = req.nextUrl
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')
  const query = searchParams.get('query') || searchParams.get('search')
  const type = searchParams.get('type') || ''
  const radius = searchParams.get('radius') || '50000'
  const placeId = searchParams.get('placeId') || searchParams.get('place_id')

  try {
    // Place details by ID
    if (placeId) {
      const fields = 'name,formatted_address,geometry,types,rating,opening_hours,formatted_phone_number,website,price_level,photos'
      const url = `${PLACES_BASE}/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.status !== 'OK') {
        return NextResponse.json({ error: data.error_message || data.status }, { status: 404 })
      }
      return NextResponse.json({ place: data.result })
    }

    // Text search (name-based)
    if (query && !lat) {
      const url = `${PLACES_BASE}/textsearch/json?query=${encodeURIComponent(query)}&type=${type}&key=${apiKey}`
      const res = await fetch(url)
      const data = await res.json()
      return NextResponse.json({
        results: data.results ?? [],
        status: data.status,
      })
    }

    // Nearby search
    if (lat && lng) {
      let url = `${PLACES_BASE}/nearbysearch/json?location=${lat},${lng}&radius=${radius}&key=${apiKey}`
      if (type) url += `&type=${type}`
      if (query) url += `&keyword=${encodeURIComponent(query)}`

      const res = await fetch(url)
      const data = await res.json()
      return NextResponse.json({
        results: data.results ?? [],
        status: data.status,
      })
    }

    return NextResponse.json(
      { error: 'Provide at least one of: placeId, query, or lat+lng' },
      { status: 400 },
    )
  } catch (err) {
    console.error('[api/integrations/places] Error:', err)
    return NextResponse.json({ error: 'Places API request failed' }, { status: 502 })
  }
}