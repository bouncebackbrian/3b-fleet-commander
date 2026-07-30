/**
 * POST /api/fleet/dump-truck/scan-load-tag — OCR pre-fill for a load-tag
 * photo attached to a specific timeline event (digital dispatch ticket).
 *
 * Sibling of scan-load-ticket (same Claude vision pattern) — kept separate
 * because the caller here is per-event photo capture on the ticket, not the
 * shift-level load-cycle ticket flow. "Location" isn't OCR'd — the event
 * already has real device GPS; only tag number/weight/material/time come
 * from the photo. Never writes anything itself — the caller (driver UI)
 * reviews the result then POSTs it via attachLoadTagToEvent.
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'

const PROMPT = `You are reading a load tag / scale ticket photo taken by a dump truck driver
at the moment of a pickup or drop-off. Extract whatever is actually printed or
handwritten on it. Return ONLY a valid JSON object — no markdown, no explanation.

Return this exact JSON shape:
{
  "ticketNumber": "the tag/ticket number printed on it" or null,
  "netWeightTons": number or null (prefer this — NET weight in tons; convert
    lb to tons if needed: tons = lb / 2000; if only one total weight is shown
    with no gross/tare breakdown, use that as netWeightTons),
  "grossWeightLb": number or null,
  "tareWeightLb": number or null,
  "material": "product/material description" or null,
  "date": "YYYY-MM-DD" or null,
  "time": "HH:MM in 24h format" or null,
  "confidence": "high" | "medium" | "low"
}

If the image is unreadable or clearly not a load tag / scale ticket, return
{"error": "Cannot read tag", "confidence": "low"}
Return ONLY the JSON — nothing else`

export async function POST(req: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  let file: File | null = null
  try {
    const form = await req.formData()
    file = form.get('file') as File | null
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
  if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Unsupported file type. Use a photo of the load tag.' }, { status: 400 })
  }

  const bytes     = await file.arrayBuffer()
  const base64    = Buffer.from(bytes).toString('base64')
  const mediaType = (file.type === 'image/heic' || file.type === 'image/heif')
    ? 'image/jpeg'
    : file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text',  text: PROMPT },
        ],
      }],
    })

    const raw     = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    try {
      const data = JSON.parse(cleaned)
      if (data.error) {
        return NextResponse.json({ error: data.error, confidence: 'low' }, { status: 422 })
      }
      return NextResponse.json(data)
    } catch {
      return NextResponse.json({ error: 'Could not parse load tag', raw }, { status: 422 })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
