import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const PROMPT = `You are reading a DOT Medical Examiner's Certificate (DOT physical card) or commercial driver medical certificate.

Extract every field you can see and return ONLY a valid JSON object — no markdown, no explanation.

{
  "card_number":        certificate or card number exactly as printed (string or null),
  "examiner_name":      medical examiner's full name (string or null),
  "examiner_npi":       National Provider Identifier (NPI) number if shown (string or null),
  "examiner_address":   examiner's clinic or office address (string or null),
  "issued":             certificate issue date in YYYY-MM-DD format (string or null),
  "expiry":             certificate expiration date in YYYY-MM-DD format (string or null),
  "driver_name":        driver's full name if shown (string or null),
  "dob":                driver's date of birth in YYYY-MM-DD format if shown (string or null),
  "restrictions":       any medical restrictions or conditions noted e.g. "must wear corrective lenses", "hearing aid required" (string or null),
  "vision_waiver":      true if a vision waiver or exemption is noted, false otherwise (boolean),
  "hearing_waiver":     true if a hearing waiver or exemption is noted, false otherwise (boolean),
  "skill_performance":  true if skill performance evaluation certificate is referenced (boolean),
  "doc_type":           "medical"
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
      return NextResponse.json({ error: 'Could not parse medical card data', raw }, { status: 422 })
    }
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
