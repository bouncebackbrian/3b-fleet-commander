import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

const SYSTEM = `You are the 3B Fleet Commander operational intelligence engine.

You receive a lane's full event history and return a tight, actionable operational insight for the driver — written as if a seasoned dispatcher handed them a sticky note before departure.

Rules:
- Maximum 3 sentences. No filler. No hedging.
- Lead with the most important pattern or risk.
- If the lane is clean, say so clearly — drivers want green lights too.
- Use driver language: "Receiver", "dock", "scale", "Love's", not "facility" or "vendor".
- Never use bullet points. Prose only.
- If there are no events, return: "No prior history on this lane. Log events as you go — the system learns from your runs."`

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 })

  try {
    const { mission, events, history } = await req.json()

    // Build a concise event summary — we don't need full rows, just patterns
    type EventEntry = { eventType: string; severity: string; notes?: string | null; createdAt: string }

    const summariseEvents = (evs: EventEntry[], label: string) => {
      if (!evs?.length) return `${label}: none`
      const counts: Record<string, number> = {}
      for (const e of evs) counts[e.eventType] = (counts[e.eventType] ?? 0) + 1
      const lines = Object.entries(counts).map(([t, n]) => `${t} ×${n}`)
      const notes = evs.filter((e: EventEntry) => e.notes).map((e: EventEntry) => `"${e.notes}"`).slice(0, 3)
      return `${label}: ${lines.join(', ')}${notes.length ? ` | Notes: ${notes.join('; ')}` : ''}`
    }

    const prompt = `Lane: ${mission?.origin ?? '?'} → ${mission?.destination ?? '?'}
Rig: ${mission?.rigType ?? 'semi-solo'} | ${mission?.dispatchMiles ?? 0} loaded mi | $${mission?.grossRate ?? 0} gross

${summariseEvents(events, 'Current mission events')}
${summariseEvents(history, 'Prior lane history (last 50 events)')}

Generate the operational insight now.`

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })

    const insight = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim()

    return NextResponse.json({ insight })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Insight generation failed' },
      { status: 500 },
    )
  }
}
