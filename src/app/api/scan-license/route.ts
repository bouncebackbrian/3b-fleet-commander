import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const PROMPT = `You are reading a photo of a commercial driver's license (CDL) or standard driver's license.

Extract every field you can see and return ONLY a valid JSON object — no markdown, no explanation.

{
  "full_name":     full legal name as printed (string or null),
  "address":       street address line (string or null),
  "city":          city (string or null),
  "state":         2-letter state abbreviation (string or null),
  "zip":           zip code (string or null),
  "dob":           date of birth in YYYY-MM-DD format (string or null),
  "cdl_number":    license number exactly as printed (string or null),
  "cdl_class":     license class — "A", "B", or "C" (string or null),
  "endorsements":  endorsement codes as comma-separated string e.g. "H, N, T" (string or null),
  "restrictions":  restriction codes if any (string or null),
  "issued_state":  2-letter state that issued the license (string or null),
  "expiry":        expiration date in YYYY-MM-DD format (string or null),
  "issued":        issue date in YYYY-MM-DD format if visible (string or null)
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
      max_tokens:  512,
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
      return NextResponse.json({ error: 'Could not parse license data', raw }, { status: 422 })
    }
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
