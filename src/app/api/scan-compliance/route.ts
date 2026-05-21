import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const PROMPTS = {
  registration: `You are reading a vehicle registration document or registration card.

Extract every field you can see and return ONLY a valid JSON object — no markdown, no explanation.

{
  "vin":               full VIN number (string or null),
  "year":              model year as 4-digit string e.g. "2019" (string or null),
  "make":              vehicle make e.g. "Peterbilt" (string or null),
  "model":             vehicle model e.g. "389" (string or null),
  "plate":             license plate number (string or null),
  "plate_state":       2-letter state abbreviation for the plate (string or null),
  "owner_name":        registered owner name or business name (string or null),
  "owner_address":     registered owner address (string or null),
  "expiry":            registration expiration date in YYYY-MM-DD format (string or null),
  "registered_weight": gross vehicle weight if shown, as number in lbs (number or null),
  "doc_type":          "registration"
}

If a field is not visible, return null. Return only the JSON object.`,

  insurance: `You are reading a commercial vehicle insurance card or insurance declaration page.

Extract every field you can see and return ONLY a valid JSON object — no markdown, no explanation.

{
  "policy_number":  policy number exactly as printed (string or null),
  "insurer":        insurance company name (string or null),
  "effective":      policy effective/start date in YYYY-MM-DD format (string or null),
  "expiry":         policy expiration date in YYYY-MM-DD format (string or null),
  "named_insured":  named insured — person or business name (string or null),
  "vin":            vehicle VIN if shown (string or null),
  "coverage_type":  type of coverage e.g. "Commercial Auto", "Cargo", "Liability" (string or null),
  "coverage_limit": liability limit if shown e.g. "$1,000,000" (string or null),
  "agent_name":     agent name if shown (string or null),
  "agent_phone":    agent phone if shown (string or null),
  "doc_type":       "insurance"
}

If a field is not visible, return null. Return only the JSON object.`,
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })

  let file:    File | null   = null
  let docType: string | null = null

  try {
    const form = await req.formData()
    file    = form.get('file')    as File   | null
    docType = form.get('docType') as string | null
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  if (!file)    return NextResponse.json({ error: 'No file provided' },   { status: 400 })
  if (!docType || !['registration', 'insurance'].includes(docType)) {
    return NextResponse.json({ error: 'docType must be "registration" or "insurance"' }, { status: 400 })
  }

  const bytes     = await file.arrayBuffer()
  const base64    = Buffer.from(bytes).toString('base64')
  const mediaType = (file.type === 'image/heic' || file.type === 'image/heif')
    ? 'image/jpeg'
    : file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

  const client = new Anthropic({ apiKey })
  const prompt = PROMPTS[docType as 'registration' | 'insurance']

  try {
    const message = await client.messages.create({
      model:      'claude-opus-4-7',
      max_tokens:  512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text',  text: prompt }
        ]
      }]
    })

    const raw     = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    try {
      const data = JSON.parse(cleaned)
      return NextResponse.json({ ...data, scannedAt: new Date().toISOString() })
    } catch {
      return NextResponse.json({ error: 'Could not parse document data', raw }, { status: 422 })
    }
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
