import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const PROMPT = `You are reading a photo of a Bill of Lading (BOL) or rate confirmation document used in freight trucking.

Extract every field you can see and return ONLY a valid JSON object — no markdown, no explanation.

{
  "loadNumber":    "load or pro number (string or null)",
  "bolNumber":     "BOL reference number if different from load number (string or null)",
  "broker":        "broker or carrier name (string or null)",
  "shipper":       "shipper/sender company name (string or null)",
  "origin":        "pickup city and state as 'City, ST' (string or null)",
  "originAddress": "full pickup street address (string or null)",
  "destination":   "delivery city and state as 'City, ST' (string or null)",
  "destAddress":   "full delivery street address (string or null)",
  "commodity":     "description of freight/goods being shipped (string or null)",
  "weight":        "total weight in lbs as a number string (string or null)",
  "pieces":        "number of pieces/pallets/units (string or null)",
  "grossRate":     "total pay/rate in dollars as a number string, no $ sign (string or null)",
  "miles":         "loaded miles if printed (string or null)",
  "pickupDate":    "pickup date/time if visible (string or null)",
  "deliveryDate":  "delivery date/time if visible (string or null)",
  "poNumber":      "PO or purchase order number (string or null)",
  "notes":         "any special instructions, hazmat info, temperature, or requirements (string or null)"
}

If a field is not visible or unclear, return null for that field.
Return only the JSON object. No extra text.`

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })

  let file: File | null = null
  try {
    const form = await req.formData()
    file = form.get('file') as File | null
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
  if (!allowed.includes(file.type) && !file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Image file required (JPEG, PNG, WebP, or HEIC)' }, { status: 400 })
  }

  const bytes     = await file.arrayBuffer()
  const base64    = Buffer.from(bytes).toString('base64')
  const mediaType = (file.type === 'image/heic' || file.type === 'image/heif')
    ? 'image/jpeg'
    : file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model:      'claude-opus-4-7',
      max_tokens:  600,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text',  text: PROMPT }
        ]
      }]
    })

    const raw     = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    try {
      const data = JSON.parse(cleaned)
      return NextResponse.json({ ...data, scannedAt: new Date().toISOString() })
    } catch {
      return NextResponse.json({ error: 'Could not parse BOL data', raw }, { status: 422 })
    }
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
