import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 })

  try {
    const body = await req.json()
    const {
      loadText = '',
      driveHoursRemaining = null,
      shiftHoursRemaining = null,
      cycleHoursRemaining = null,
      fuelPrice = 3.85,
      mpg = 6.2,
      tankGal = 120,
      truckHeight = 13.5,
      trailerHeight = 13.5,
      trailerLen = 53,
      maxWeight = 80000,
    } = body

    const hosContext = driveHoursRemaining != null
      ? `Current HOS: ${driveHoursRemaining.toFixed(1)}h drive remaining, ${shiftHoursRemaining?.toFixed(1) ?? '?'}h shift remaining, ${cycleHoursRemaining?.toFixed(1) ?? '?'}h cycle remaining.`
      : 'No current HOS data available — assume driver is fully rested (11h drive / 14h shift available).'

    const truckContext = `Truck setup: ${fuelPrice}/gal diesel, ${mpg} MPG loaded, ${tankGal} gal tank, height ${truckHeight}ft cab + ${trailerHeight}ft trailer, ${trailerLen}ft trailer, max weight ${maxWeight.toLocaleString()} lbs.`

    const system = `You are Load Prep AI for 3B Fleet Commander — a trucking mileage intelligence system for an owner-operator. Your job is to analyze a load offer and give a clear, direct recommendation.

${hosContext}
${truckContext}

When analyzing a load, you:
1. Extract all available fields from the text
2. Calculate gross pay, fuel cost, and net pay
3. Check if HOS allows legal completion of the load
4. Check legal compliance (weight, height)
5. Flag anything suspicious (low rate, missing info, tight delivery window, scale issues)
6. Give a definitive ACCEPT or DENY recommendation with plain reasoning a driver can act on immediately

Respond ONLY with valid JSON matching this exact shape:
{
  "recommendation": "ACCEPT" | "DENY" | "REVIEW",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "summary": "One sentence plain-English verdict",
  "parsed": {
    "origin": string | null,
    "originName": string | null,
    "originPhone": string | null,
    "dest": string | null,
    "destName": string | null,
    "destPhone": string | null,
    "miles": number | null,
    "cpm": number | null,
    "weight": number | null,
    "loadNum": string | null,
    "broker": string | null,
    "commodity": string | null,
    "depart": string | null,
    "deadhead": number | null,
    "totalPay": number | null,
    "stops": [
      {
        "sequence": number,
        "type": "pickup" | "delivery" | "relay" | "other",
        "name": string | null,
        "address": string | null,
        "city": string | null,
        "state": string | null,
        "phone": string | null,
        "appt": string | null,
        "reference": string | null
      }
    ]
  },
  "financials": {
    "grossPay": number | null,
    "fuelCost": number | null,
    "netPay": number | null,
    "cpm": number | null,
    "profitScore": number,
    "ratePerMile": number | null
  },
  "hos": {
    "legal": boolean,
    "driveNeeded": number | null,
    "driveAvailable": number | null,
    "note": string
  },
  "legal": {
    "weightOk": boolean | null,
    "heightOk": boolean | null,
    "notes": string[]
  },
  "redFlags": string[],
  "greenFlags": string[],
  "reasons": string[],
  "suggestedReply": string
}

Rules for parsed fields:
- originName/destName: the facility or company name at each location (separate from the city/state address string).
- originPhone/destPhone: phone number for the pickup or delivery facility if mentioned.
- stops: populate only if the load text explicitly describes 3+ locations or a multi-stop sequence. Otherwise return an empty array [].
- "fuelCost" in financials refers to diesel cost — calculate as (miles / mpg) × dieselPrice.`

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: `Analyze this load offer:\n\n${loadText}` }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    // Strip any markdown code fences
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const result = JSON.parse(clean)

    return NextResponse.json(result)
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 }
    )
  }
}
