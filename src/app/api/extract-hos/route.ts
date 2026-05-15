import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const PROMPT = `You are reading a screenshot of a trucking ELD / HOS (Hours of Service) app — likely Samsara, Motive/KeepTruckin, or similar.

Extract the HOS data and return ONLY a valid JSON object — no markdown, no explanation.

Fields to extract:
{
  "status": current duty status as a string — one of: "Driving", "On Duty", "Off Duty", "Sleeper Berth", or the exact text shown,
  "driveRemainingHrs": remaining drive time as a decimal number (e.g. 8.5 for 8h 30m), or null,
  "shiftRemainingHrs": remaining on-duty / shift time as a decimal number, or null,
  "breakInHrs": time until next required 30-min break as a decimal number, or null if not shown or not applicable,
  "cycleRemainingHrs": remaining 70-hour / 8-day cycle time as a decimal number, or null,
  "driveUsedHrs": drive time already used today as a decimal number, or null,
  "onDutyUsedHrs": on-duty time already used today as a decimal number, or null,
  "lastBreakHrs": hours since last break/rest, or null,
  "notes": any other relevant text visible (violations, warnings, etc), or null
}

Convert all time values to decimal hours (e.g. "3:45" or "3h 45m" = 3.75). If a field is not visible, return null.
Return only the JSON object.`

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

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Use JPEG, PNG, WebP, or GIF' }, { status: 400 })
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
      return NextResponse.json({ ...data, scannedAt: new Date().toISOString() })
    } catch {
      return NextResponse.json({ error: 'Could not parse HOS data', raw }, { status: 422 })
    }
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
