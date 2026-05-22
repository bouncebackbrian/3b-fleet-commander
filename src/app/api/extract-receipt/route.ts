import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const PROMPT = `You are reading a fuel receipt image for a commercial truck driver. Extract all data and return ONLY a valid JSON object — no markdown, no explanation, no extra text.

Fields to extract:
{
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM in 24h format or null",
  "fuelStopName": "station name only (e.g. 'Love's #342', 'Pilot Flying J', 'TA Travel Center') or null",
  "fuelStopChain": "chain brand only: 'Loves' | 'Pilot' | 'FlyingJ' | 'TA' | 'Petro' | 'Kwik Trip' | 'Speedway' | 'Shell' | 'Exxon' | 'other' — or null",
  "address": "street address only or null",
  "city": "city name or null",
  "state": "2-letter state code or null",
  "fuelType": "diesel" | "def" | "reefer" | "other" — infer from product description; diesel/tractor fuel = diesel; reefer/refrigeration fuel = reefer; DEF = def; default to diesel if unclear,
  "gallons": number or null,
  "pricePerGal": number or null,
  "totalCost": number or null,
  "truckNumber": "unit/truck number if printed on receipt or null",
  "odometer": integer odometer reading if shown or null,
  "transactionId": "transaction or invoice number or null",
  "cardLast4": "last 4 of payment card if shown or null",
  "notes": "any other useful info or null"
}

Rules:
- Return ONLY the JSON object. No explanation.
- Use null for any field not found.
- totalCost should be the total amount charged (not per-gallon).
- If multiple fuel types on one receipt, use the primary product.`

export async function POST(req: NextRequest) {
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

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type. Use JPEG, PNG, WebP, or GIF.' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: PROMPT }
        ]
      }]
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    try {
      const data = JSON.parse(cleaned)
      return NextResponse.json(data)
    } catch {
      return NextResponse.json({ error: 'Could not parse receipt data', raw }, { status: 422 })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
