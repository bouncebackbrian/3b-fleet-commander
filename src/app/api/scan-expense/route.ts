import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const PROMPT = `You are reading a receipt or financial document for a commercial truck driver.
Analyze the image and extract ALL relevant data. Return ONLY a valid JSON object — no markdown, no explanation, no extra text.

Determine the category by the receipt type:
- "fuel"     → diesel, DEF, reefer fuel, gas station
- "lumper"   → lumper service, unloading fee, dock labor
- "scale"    → weigh station, CAT scale, truck scale ticket
- "parking"  → truck stop parking, lot fee, overnight parking
- "tolls"    → toll receipt, EZPass, turnpike
- "repairs"  → truck repair, tires, parts, maintenance, oil change, shop invoice
- "meals"    → restaurant, fast food, convenience store food
- "lodging"  → hotel, motel, truck stop shower (if overnight)
- "supplies" → safety supplies, straps, tarps, logbooks, equipment
- "def"      → DEF fluid specifically
- "other"    → anything that doesn't fit above

Return this exact JSON shape:
{
  "category": one of the category strings above,
  "amount": total dollar amount as a number (no $ sign), or null if unreadable,
  "vendor": "business/vendor name" or null,
  "description": "brief description of what was purchased" or null,
  "address": "street address" or null,
  "city": "city name" or null,
  "state": "2-letter state code" or null,
  "date": "YYYY-MM-DD" or null,
  "time": "HH:MM in 24h format" or null,
  "loadNumber": "load or BOL number if printed on receipt" or null,
  "fuelGallons": number or null (fuel receipts only),
  "fuelPricePerGal": number or null (fuel receipts only),
  "fuelType": "diesel" | "def" | "reefer" | "other" or null (fuel receipts only),
  "truckNumber": "unit/truck number if shown" or null,
  "odometer": integer odometer reading if shown or null,
  "lumperWorkers": integer number of workers if shown or null,
  "scaleWeight": integer gross weight in pounds if shown or null,
  "transactionId": "receipt/transaction/ticket number" or null,
  "notes": "any other useful operational info not captured above" or null,
  "confidence": "high" | "medium" | "low"
}

Important:
- amount should be the TOTAL charged, not subtotals
- For fuel: amount = total fuel cost (not per-gallon price)
- For lumper: amount = total labor/service fee
- If receipt is unreadable or not a receipt, return {"error": "Cannot read receipt", "confidence": "low"}
- Return ONLY the JSON — nothing else`

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

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
  if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Unsupported file type. Use a photo of the receipt.' }, { status: 400 })
  }

  const bytes     = await file.arrayBuffer()
  const base64    = Buffer.from(bytes).toString('base64')
  const mediaType = (file.type === 'image/heic' || file.type === 'image/heif')
    ? 'image/jpeg'   // Claude treats HEIC as JPEG fallback
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
      return NextResponse.json({ error: 'Could not parse receipt', raw }, { status: 422 })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
