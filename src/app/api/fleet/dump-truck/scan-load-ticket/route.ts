/**
 * POST /api/fleet/dump-truck/scan-load-ticket — OCR pre-fill for a photographed
 * scale/load ticket (spec §9 load ticket capture).
 *
 * Same pattern as /api/scan-expense (Claude vision, driver reviews/edits before
 * saving — this never writes anything itself). A separate endpoint rather than
 * reusing scan-expense because ticket fields differ (gross/tare/net weight
 * breakdown, material, order#) from expense-receipt fields, and formats vary
 * a lot in practice — some scale houses print a full gross/tare/net breakdown
 * (e.g. Dayton Materials), others just hand over a total. The prompt asks for
 * whatever is present and returns null for the rest rather than guessing.
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'

const PROMPT = `You are reading a scale ticket or load ticket for a dump truck driver hauling
aggregate/fill material. Formats vary a lot: some print a full gross/tare/net weight
breakdown (in both lb and tons), a product code, order number, and customer — others
just hand-write a single total weight. Extract whatever is actually present. Return
ONLY a valid JSON object — no markdown, no explanation, no extra text.

Return this exact JSON shape:
{
  "ticketNumber": "the ticket/tag number printed on the ticket" or null,
  "netWeightTons": number or null (prefer this — the NET weight in tons; if only
    net weight in lb is shown, convert: tons = lb / 2000; if only a single total
    weight is given with no gross/tare breakdown, use that as netWeightTons),
  "grossWeightLb": number or null,
  "tareWeightLb": number or null,
  "material": "product/material description, e.g. Structural Fill" or null,
  "orderNumber": "order # or job # printed on the ticket" or null,
  "customerName": "customer/project name printed on the ticket" or null,
  "date": "YYYY-MM-DD" or null,
  "time": "HH:MM in 24h format" or null,
  "confidence": "high" | "medium" | "low"
}

Important:
- If the image is unreadable or clearly not a scale/load ticket, return
  {"error": "Cannot read ticket", "confidence": "low"}
- Return ONLY the JSON — nothing else`

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
    return NextResponse.json({ error: 'Unsupported file type. Use a photo of the ticket.' }, { status: 400 })
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
      return NextResponse.json({ error: 'Could not parse ticket', raw }, { status: 422 })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
