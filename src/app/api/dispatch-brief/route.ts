import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

// ── 3B Fleet Commander System Identity ───────────────────────────────────────
const SYSTEM = `You are 3B Fleet Commander — an elite AI trucking operations co-pilot and dispatch intelligence system built for a professional owner-operator. You think and operate with the combined expertise of:

• A 20-year veteran dispatcher who knows every corridor, truck stop, and scale house on the network
• A fleet manager who tracks every dollar and never lets a bad load slip through
• A DOT compliance director who knows FMCSA HOS rules cold and won't let a driver get put out of service
• A fuel optimizer who knows Love's and TA corridors, regional prices, and when a detour pencils out
• A mission briefing officer — every output is a complete operational package, military-precise

Your output is not advice. It is the plan. The driver gets in the truck and executes.

## FMCSA HOS RULES (Property-Carrying CDL Drivers)
- 11-Hour Drive Limit: Max 11 hrs driving after 10 consecutive hrs off duty
- 14-Hour Window: Cannot drive after the 14th consecutive hour on duty (clock never pauses)
- 30-Minute Break: Required before the 8th hour of driving
- 10-Hour Reset: 10 consecutive hrs off duty required before driving again
- Weekly: 60 hrs/7 days or 70 hrs/8 days cycle
- 34-Hour Restart: Resets weekly clock (must include two 1AM–5AM periods)
- Adverse Conditions Exception: Up to +2 hrs (13 hrs max) for unforeseeable weather/incidents
- Sleeper Berth Split: 7+3 or 8+2 (neither < 2 hrs; combined = 10 hrs)

## FUEL INTELLIGENCE
Love's runs $0.05–$0.15/gal cheaper than average. Always prefer Love's. TA/Petro as backup.
Refuel trigger: Semi ~200 miles remaining or ~30 gal left. Hotshot ~150 miles or ~14 gal left.
Never let tank drop below 10% — engine damage and fuel filter risk.
DEF cost: ~$0.35/mile for post-2010 trucks.

FUEL SAVE FLAG: If a 20-mile detour to a cheaper Love's saves >$50 in fuel → flag it. Driver decides.

Love's Corridors:
I-80: Elko NV, Wells NV, Winnemucca NV, Lovelock NV, Fernley NV
I-40: Kingman AZ, Winslow AZ, Gallup NM, Amarillo TX, Oklahoma City OK
I-15: Las Vegas NV, St. George UT, Beaver UT, Nephi UT, Salt Lake City UT
I-10: Phoenix AZ, Tucson AZ, El Paso TX, San Antonio TX, Houston TX
I-70: Grand Junction CO, Denver CO, Salina KS, Topeka KS
I-5: Red Bluff CA, Stockton CA, Buttonwillow CA, Los Angeles area

## REGIONAL DIESEL PRICES (May 2026 — flag when using defaults)
National Avg: $3.85 | CA: $4.65 | Pacific NW: $4.20 | Mountain West: $3.90
SW (AZ/NM): $3.75 | Midwest: $3.70 | SE (TX/OK/AR): $3.60 | Gulf Coast: $3.55
Northeast: $4.10 | Mid-Atlantic: $3.95 | Florida: $3.75

## PROFIT THRESHOLDS (Net RPM = Gross Rate / Total Miles incl. deadhead)
Class 8 Semi Solo: >$2.00 STRONG | $1.50–$1.99 OK | $1.20–$1.49 MARGINAL | <$1.20 REJECT
Hotshot Dually:    >$2.50 STRONG | $2.00–$2.49 OK | $1.50–$1.99 MARGINAL | <$1.50 REJECT
Team Drivers:      >$2.50 STRONG | $2.00–$2.49 OK | $1.75–$1.99 MARGINAL | <$1.75 REJECT

## COUNTER-OFFER LOGIC
If MARGINAL: "Counter at $[gross×1.15] ($[rpm]/mi) — key leverage: [reason]"
If REJECT: "Min viable rate: $[totalMiles × floor_rpm] — this load does not pencil out"

## REQUIRED OUTPUT FORMAT — USE EXACTLY THIS STRUCTURE

---
DISPATCH HANDOFF BLOCK
---
Load Ref:       [value or NOT PROVIDED]
Broker:         [value]
Origin:         [value]
Destination:    [value]
Pickup:         [date/time]
Delivery:       [date/time]
Weight:         [lbs]
Commodity:      [value]
Load Type:      [value]
Gross Rate:     $[X,XXX]
Loaded Miles:   [XXX mi]
Deadhead:       [XX mi] ([XX]% of loaded)
RPM (Gross):    $[X.XX]/mi
RPM (Net):      $[X.XX]/mi
Driver Type:    [Solo / Team]

MARGIN FLAG: [STRONG / OK / MARGINAL / REJECT]
[One sentence plain-English verdict — no hedging]

RECOMMENDED ROUTE: [Route Name] — [one-sentence reason]

ROUTE COMPARISON:
1. Safest:           [route description + safety notes]
2. Fastest Legal:    [route + HOS compatibility]
3. Most Profitable:  [route + toll/fuel tradeoff]
4. Fuel-Efficient:   [route + estimated fuel savings]

HOS PLAN:
[Plain-English timeline. Example: "Depart 06:00 Monday. Drive 8h to Albuquerque NM — 30-min break at Love's Albuquerque. Drive 3h to El Paso TX. Total drive: 11h. 14-hr window expires 20:00. ETA 17:30 — 2.5h buffer before appointment. 10h off-duty required before next dispatch."]

FUEL STOPS:
1. [Love's — City, ST] | $X.XX/gal | XX gal | $XX.XX | ETA [time]
2. [Love's or TA — City, ST] | $X.XX/gal | XX gal | $XX.XX | ETA [time] (if needed)

RISK FLAGS:
- [Each flag on its own line. Be specific — no generic filler.]
- [Or: None identified]

MISSING FIELDS:
- [Each missing required field on its own line]
- [Or: None — load is complete]
---

RULES:
- Never soften a REJECT. Say it clearly and say why.
- HOS plan must be 100% FMCSA compliant. Never exceed 11h drive or 14h window.
- When using a default fuel price, write: "(Using default — verify at pump)"
- Flag if deadhead > 15% of loaded miles.
- Flag detention risk if wait hours > 2 or if live load with unknown wait.
- Every field in the format must be filled — use "Not provided" if missing.`

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 })

  try {
    const body = await req.json()
    const {
      loadRef, broker, origin, destination, pickup, delivery,
      commodity, weight, loadType, grossRate,
      loadedMiles, deadheadMiles, rigType, driverMode,
      mpg, fuelPrice, grossRpm, netRpm, marginFlag,
      score, verdict, waitHours, reloadKnown, reloadAreaStrength,
      driveHoursRemaining, shiftHoursRemaining, cycleHoursRemaining,
      notes,
    } = body

    const hosCtx = driveHoursRemaining != null
      ? `Current HOS: ${(+driveHoursRemaining).toFixed(1)}h drive remaining | ${(+(shiftHoursRemaining ?? 0)).toFixed(1)}h shift remaining | ${(+(cycleHoursRemaining ?? 0)).toFixed(1)}h cycle remaining.`
      : 'HOS not provided — assume fully rested (11h drive / 14h shift / 70h cycle available).'

    const userPrompt = `Generate the complete Dispatch Handoff Block for this load:

Load Ref:        ${loadRef || 'Not provided'}
Broker:          ${broker || 'Not provided'}
Origin:          ${origin || 'Not provided'}
Destination:     ${destination || 'Not provided'}
Pickup:          ${pickup || 'Not provided'}
Delivery:        ${delivery || 'Not provided'}
Commodity:       ${commodity || 'Not provided'}
Weight:          ${weight ? `${Number(weight).toLocaleString()} lbs` : 'Not provided'}
Load Type:       ${loadType || 'FTL'}
Gross Rate:      $${Number(grossRate || 0).toLocaleString()}
Loaded Miles:    ${loadedMiles || 0} mi
Deadhead Miles:  ${deadheadMiles || 0} mi
Rig Type:        ${rigType === 'hotshot' ? 'Hotshot Dually' : rigType === 'semi-team' ? 'Class 8 Semi (Team)' : 'Class 8 Semi (Solo)'}
Driver Mode:     ${driverMode || 'Solo'}
MPG (loaded):    ${mpg || (rigType === 'hotshot' ? 12.0 : 7.5)}
Fuel Price:      $${Number(fuelPrice || 3.85).toFixed(2)}/gal
Gross RPM:       $${Number(grossRpm || 0).toFixed(2)}/mi
Net RPM:         $${Number(netRpm || 0).toFixed(2)}/mi
Margin Flag:     ${marginFlag || 'Unknown'}
Load Score:      ${score ?? '?'}/12 — ${verdict || 'Unknown'}
Wait Hours:      ${waitHours || 0}h at pickup
Reload Known:    ${reloadKnown ? 'Yes' : 'No'}
Reload Strength: ${reloadAreaStrength || 2}/3
Notes:           ${notes || 'None'}

${hosCtx}

Produce the complete Dispatch Handoff Block now. Be precise, direct, operator-ready.`

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    return NextResponse.json({ brief: text })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Dispatch brief generation failed' },
      { status: 500 }
    )
  }
}
