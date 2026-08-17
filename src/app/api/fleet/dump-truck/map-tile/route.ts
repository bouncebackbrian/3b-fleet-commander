/**
 * GET /api/fleet/dump-truck/map-tile?lat=..&lng=.. — single OpenStreetMap
 * raster tile, proxied server-side.
 *
 * The client-side photo geotag stamp (src/lib/dumpTruck/photoStamp.ts) draws
 * this tile onto a <canvas> to compose the map thumbnail baked into incident
 * photos. Fetching it directly from tile.openstreetmap.org in the browser
 * would taint the canvas (no CORS header on tile responses), so this route
 * fetches it server-side — where CORS doesn't apply — and re-serves it
 * same-origin. No Maps API key is configured anywhere in this repo, so this
 * is the only tile source available without adding a paid dependency.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'

export const dynamic = 'force-dynamic'

const ZOOM = 16

function lonLatToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom
  const x = Math.floor(((lng + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return { x: Math.min(Math.max(x, 0), n - 1), y: Math.min(Math.max(y, 0), n - 1) }
}

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const lat = Number(searchParams.get('lat'))
  const lng = Number(searchParams.get('lng'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 })
  }

  const { x, y } = lonLatToTile(lat, lng, ZOOM)

  try {
    const tileRes = await fetch(`https://tile.openstreetmap.org/${ZOOM}/${x}/${y}.png`, {
      headers: { 'User-Agent': 'FleetCommander/1.0 (incident photo geotag; contact 3becosystem@gmail.com)' },
    })
    if (!tileRes.ok) return NextResponse.json({ error: 'Could not load map tile' }, { status: 502 })

    const bytes = await tileRes.arrayBuffer()
    return new NextResponse(bytes, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' },
    })
  } catch (err) {
    console.error('[api/fleet/dump-truck/map-tile] GET error:', err)
    return NextResponse.json({ error: 'Could not load map tile' }, { status: 502 })
  }
}
