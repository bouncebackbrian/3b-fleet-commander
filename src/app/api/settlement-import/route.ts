import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const PROMPT = `You are reading a trucking carrier settlement statement / pay stub.

Extract ALL information and return ONLY a valid JSON object. No markdown, no extra text.

{
  "driver":       "driver full name (string or null)",
  "carrier":      "carrier or company name (string or null)",
  "periodEnding": "period ending date in YYYY-MM-DD (string or null)",
  "periodStart":  "period start date in YYYY-MM-DD if visible (string or null)",
  "checkNumber":  "check or payment reference number if visible (string or null)",

  "grossPay":     gross total pay in dollars as a number (number or null),
  "taxableWages": taxable wages amount (number or null),
  "perDiem":      per diem total amount (number or null),
  "deductions":   total deductions in dollars as a number (number or null),
  "netPay":       net pay after deductions (number or null),

  "loadedMiles":  total loaded miles as a number (number or null),
  "emptyMiles":   total empty/deadhead miles as a number (number or null),
  "totalMiles":   total miles driven as a number (number or null),
  "dispatches":   number of dispatches or loads (number or null),
  "baseCpm":      stated CPM rate (cost per mile) as a number e.g. 0.50 (number or null),

  "loads": [
    {
      "loadNumber":    "load number, pro number, or order number (string or null)",
      "origin":        "pickup city and state in 'City, ST' format (string)",
      "destination":   "delivery city and state in 'City, ST' format (string)",
      "loadedMiles":   loaded miles for this dispatch (number or null),
      "emptyMiles":    empty/positioning miles before or after (number or null),
      "grossPay":      pay for this dispatch (number or null),
      "pickupDate":    "pickup date YYYY-MM-DD (string or null)",
      "deliveryDate":  "delivery date YYYY-MM-DD (string or null)",
      "loadType":      "loaded" if carrying freight, "empty" if positioning/deadhead, "other" if unclear
    }
  ],

  "deductionItems": [
    { "description": "deduction name", "amount": dollar amount as number }
  ],

  "notes": "any other notable information on the statement (string or null)"
}

Rules:
- Convert all city/state references to 'City, ST' format (e.g. 'Sparks, NV')
- Dollar amounts as plain numbers: 1025.50 not '$1,025.50'
- Miles as plain integers: 1949 not '1,949'
- If the settlement shows total miles but no loaded/empty split, put total in loadedMiles and 0 in emptyMiles
- Extract every dispatch line item you can see — even if some fields are blank
- Return only the JSON object, nothing else`

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

  const isPdf    = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const isImage  = file.type.startsWith('image/') || (!isPdf && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))

  if (!isPdf && !isImage) {
    return NextResponse.json({ error: 'PDF or image file required (PDF, JPEG, PNG, WebP, HEIC)' }, { status: 400 })
  }

  const bytes  = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  // Handle HEIC → treat as JPEG for Claude
  const rawType  = file.type || (isPdf ? 'application/pdf' : 'image/jpeg')
  const mediaType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' =
    rawType === 'image/heic' || rawType === 'image/heif' ? 'image/jpeg'
    : isPdf ? 'application/pdf'
    : rawType as 'image/jpeg' | 'image/png' | 'image/webp'

  const client = new Anthropic({ apiKey })

  // Build content block — PDFs use 'document' type, images use 'image' type
  const contentBlock = isPdf
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
    : { type: 'image'    as const, source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: base64 } }

  try {
    const message = await client.messages.create({
      model:      'claude-opus-4-7',
      max_tokens: 4096,
      messages: [{
        role:    'user',
        content: [ contentBlock, { type: 'text', text: PROMPT } ],
      }],
    })

    const raw     = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    try {
      const data = JSON.parse(cleaned)
      return NextResponse.json({ ...data, importedAt: new Date().toISOString() })
    } catch {
      return NextResponse.json({ error: 'Could not parse settlement data', raw }, { status: 422 })
    }
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
