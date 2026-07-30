/**
 * POST /api/fleet/dump-truck/scan-site — AI-assisted site pre-fill (2026-07-30)
 *
 * Driver-requested: "just AI feature that you put a screenshot or talk to
 * location or coordinates generates all of it for me." Same pattern as
 * /api/fleet/dump-truck/scan-load-ticket (Claude vision, caller reviews/edits
 * before saving — this never writes a site itself). Two input modes:
 *
 *   - file: a screenshot (e.g. a Maps app pin showing coordinates/address) —
 *     Claude vision reads whatever is visible.
 *   - text: freeform text (typed, pasted, or dictated) — a bare "lat, lng"
 *     pair is parsed directly with a regex (no AI call needed, and more
 *     reliable than asking a model to echo numbers back correctly); anything
 *     else (a spoken description, an address, a cross-street) goes through
 *     Claude as a text-only prompt.
 *
 * Navigation links (Google/Apple Maps, Trucker Path, copy-coordinates) are
 * NOT part of this route — src/lib/dumpTruck/navigation.ts already builds
 * those for any site with lat/lng, nothing new needed there.
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'

interface ScanSiteResult {
  name: string | null
  lat: number | null
  lng: number | null
  addressLine1: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  confidence: 'high' | 'medium' | 'low'
}

const JSON_SHAPE = `{
  "name": "a short site name/label if one is visible or implied (e.g. a business name, road name, or landmark)" or null,
  "lat": number or null (decimal degrees),
  "lng": number or null (decimal degrees, negative for western hemisphere),
  "addressLine1": "street address if visible" or null,
  "city": "city" or null,
  "state": "2-letter state code" or null,
  "postalCode": "zip code" or null,
  "confidence": "high" | "medium" | "low"
}`

const IMAGE_PROMPT = `You are reading a screenshot of a maps app (Apple Maps, Google Maps, or similar)
showing a pinned location for a dump-truck pickup/dump/yard site. Extract the
coordinates and any name/address information visible. Coordinates are often
shown as decimal degrees (e.g. "39.073470,-119.940673") in a search bar or an
"About" section — prefer that exact decimal form over a DMS (degrees/minutes/
seconds) display if both are shown, since it's more precise. Return ONLY a
valid JSON object — no markdown, no explanation, no extra text.

Return this exact JSON shape:
${JSON_SHAPE}

Important:
- If the image is unreadable or clearly not a map/location screenshot, return
  {"error": "Cannot read location", "confidence": "low"}
- Return ONLY the JSON — nothing else`

function textPrompt(text: string): string {
  return `A dump-truck dispatcher typed or dictated a location description for a new
pickup/dump/yard site: "${text}"

Extract whatever structured information you can from this description (it may
be a cross-street, a landmark, a business name, a partial address, etc. — it
is NOT necessarily precise). Do not invent coordinates you cannot reasonably
infer from well-known place names; if you cannot determine lat/lng with
reasonable confidence, return null for them and let the address fields carry
what you know. Return ONLY a valid JSON object — no markdown, no explanation.

Return this exact JSON shape:
${JSON_SHAPE}

Return ONLY the JSON — nothing else`
}

// Bare "lat, lng" or "lat lng" — handles the common case (pasted from a maps
// app's search bar, like "39.205672,-119.780275") without an AI round-trip.
const COORD_PAIR = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,?\s+?(-?\d{1,3}(?:\.\d+)?)\s*$/
const COORD_PAIR_COMMA = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/

function parseBareCoordinates(text: string): ScanSiteResult | null {
  const match = COORD_PAIR_COMMA.exec(text) ?? COORD_PAIR.exec(text)
  if (!match) return null
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { name: null, lat, lng, addressLine1: null, city: null, state: null, postalCode: null, confidence: 'high' }
}

function parseModelJson(raw: string): ScanSiteResult | { error: string } {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(cleaned)
}

export async function POST(req: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

  const file = form.get('file') as File | null
  const text = form.get('text')

  if (!file && typeof text !== 'string') {
    return NextResponse.json({ error: 'Provide a screenshot (file) or a location description (text)' }, { status: 400 })
  }

  // Fast path: bare coordinates typed/pasted — no AI call.
  if (!file && typeof text === 'string') {
    const bare = parseBareCoordinates(text)
    if (bare) return NextResponse.json(bare)
  }

  const client = new Anthropic({ apiKey })

  try {
    if (file) {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
      if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
        return NextResponse.json({ error: 'Unsupported file type. Use a screenshot.' }, { status: 400 })
      }
      const bytes = await file.arrayBuffer()
      const base64 = Buffer.from(bytes).toString('base64')
      const mediaType = (file.type === 'image/heic' || file.type === 'image/heif')
        ? 'image/jpeg'
        : file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

      const message = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: IMAGE_PROMPT },
          ],
        }],
      })
      const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
      const data = parseModelJson(raw)
      if ('error' in data) return NextResponse.json({ error: data.error, confidence: 'low' }, { status: 422 })
      return NextResponse.json(data)
    }

    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 512,
      messages: [{ role: 'user', content: textPrompt(String(text)) }],
    })
    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const data = parseModelJson(raw)
    if ('error' in data) return NextResponse.json({ error: data.error, confidence: 'low' }, { status: 422 })
    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
