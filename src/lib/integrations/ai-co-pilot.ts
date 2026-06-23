/**
 * AI Co-Pilot — Fleet Commander AI Service Module
 *
 * Context-aware AI assistant for CDL truck drivers.
 * Answers questions about:
 *   - Weather ahead on the route
 *   - Fuel stops and truck parking
 *   - HOS regulations and DOT questions
 *   - Weigh station info
 *   - Route optimization
 *   - General trucking knowledge
 *
 * Integrates with HOS data and trip data for personalized responses.
 * Uses Anthropic Claude (or OpenAI as fallback) for LLM inference.
 */

import { logger } from '@/lib/logger'

// ── Types ────────────────────────────────────────────────────────────────────

export interface CoPilotContext {
  /** Current location */
  currentLocation?: {
    lat: number
    lng: number
    city?: string
    state?: string
  }
  /** Route information */
  route?: {
    origin: string
    destination: string
    milesTotal: number
    milesCompleted: number
    /** Estimated hours remaining */
    hoursRemaining: number
  }
  /** HOS / ELD data */
  hos?: {
    hoursDriven: number      // hours driven today
    hoursOnDuty: number      // hours on duty today
    hoursRemaining: number   // hours of drive time remaining
    cycleHoursUsed: number   // 70-hour / 8-day cycle usage
    cycleHoursRemaining: number
    lastBreakTime?: string   // ISO timestamp of last break
    nextBreakDue?: string    // ISO timestamp when next break needed
    status: 'driving' | 'on_duty' | 'off_duty' | 'sleeper'
  }
  /** Current weather at location */
  weather?: {
    temp: number           // °F
    condition: string      // clear, rain, snow, etc.
    windSpeed: number      // mph
    windGusts?: number
    visibility?: number    // miles
    precipChance?: number  // next 2 hours %
    alerts?: string[]      // weather alerts
  }
  /** Fuel info */
  fuel?: {
    currentLevel: number   // percentage (0-100)
    mpg: number
    milesToEmpty: number
    nearestStop?: {
      name: string
      distanceMi: number
      dieselPrice: number
    }
  }
  /** Recent events/alerts */
  alerts?: string[]
}

export interface CoPilotQuery {
  /** The driver's natural language question */
  query: string
  /** Context for personalization */
  context: CoPilotContext
  /** Conversation history for continuity */
  history?: Array<{
    role: 'driver' | 'assistant'
    message: string
    timestamp: string
  }>
}

export interface CoPilotResponse {
  /** Natural language answer */
  answer: string
  /** Structured data for UI rendering (e.g., list of stops, weather info) */
  data?: Record<string, unknown>
  /** Recommended actions */
  actions?: Array<{
    label: string
    action: string
    params?: Record<string, string>
  }>
  /** Sources/inspiration for the answer */
  sources?: string[]
}

// ── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the **3B Fleet Commander AI Co-Pilot** — an expert trucking assistant for professional CDL drivers.

YOUR PERSONALITY:
- Knowledgeable but direct — like a veteran driver who's seen it all
- Safety-first mindset — always flag potential hazards
- Concise — drivers need answers fast, not essays
- Use trucker terminology — "scale", "receiver", "shipper", "love's", "pilot", "e-logs", "breakdown"

YOUR KNOWLEDGE BASE:
- FMCSA Regulations (HOS 11/14/70 rules, 30-min break rule, 34-hour restart)
- DOT inspection procedures and common violations
- Truck parking availability patterns
- Fuel economy best practices
- Weigh station operations and bypass systems (PrePass, Drivewyze)
- Route planning for low bridges, weight restrictions, and hazmat routes
- Winter driving and weather safety
- Cargo securement regulations
- Logbook/ELD compliance

HOW TO ANSWER:
1. First, understand what the driver is asking about using the context provided
2. Give the most critical information first (safety/compliance > convenience > nice-to-know)
3. If you don't know something specific (e.g., exact diesel price at a specific Love's), say so — never make up data
4. Use the context data when relevant (current location, weather, HOS status)
5. Keep responses under 3-4 paragraphs for driving safety
6. Flag anything that sounds like a potential HOS violation or safety issue

When the driver asks about:
- **WEATHER**: Check their route, warn about conditions ahead. Suggest slower speeds or rest stops if conditions warrant.
- **FUEL**: Use fuel stop context to suggest the best place to fill up based on price, distance, and amenities.
- **PARKING**: Note that truck parking fills early (especially in NE corridor). Suggest parking at truck stops with 24hr amenities.
- **HOS**: Double-check their math. Use their cycle hours to determine if they can make the trip. Note the 30-min break requirement.
- **DOT**: Explain regulations clearly. Reference the FMCSA reg number when possible.

Respond in a helpful, driver-friendly tone.`

// ── AI Configuration ─────────────────────────────────────────────────────────

const AI_CONFIG = {
  model: 'claude-opus-4-7' as const,
  maxTokens: 600,
  temperature: 0.3,  // Lower for factual accuracy in trucking
}

// ── LLM Provider ─────────────────────────────────────────────────────────────

type LLMProvider = 'anthropic' | 'openai'

function getProvider(): LLMProvider {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  if (process.env.OPENAI_API_KEY) return 'openai'
  return 'anthropic' // Default, will throw at runtime if not configured
}

function getAPIKey(): string {
  return process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY ?? ''
}

// ── Build context prompt ─────────────────────────────────────────────────────

function buildContextBlock(context: CoPilotContext): string {
  const parts: string[] = ['## Current Context']

  if (context.currentLocation) {
    const loc = context.currentLocation
    const desc = [loc.city, loc.state].filter(Boolean).join(', ')
    parts.push(`- Location: ${desc || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`}`)
  }

  if (context.route) {
    const r = context.route
    parts.push(
      `- Route: ${r.origin} → ${r.destination}`,
      `- Trip progress: ${r.milesCompleted} / ${r.milesTotal} mi (${Math.round((r.milesCompleted / r.milesTotal) * 100)}%)`,
      `- Estimated ${r.hoursRemaining.toFixed(1)} hours remaining`,
    )
  }

  if (context.hos) {
    const h = context.hos
    parts.push(
      `- HOS: ${h.hoursDriven}h driven today | ${h.hoursRemaining.toFixed(1)}h remaining`,
      `- Cycle: ${h.cycleHoursUsed}h used / ${h.cycleHoursRemaining.toFixed(1)}h remaining (70h/8day)`,
      `- Status: ${h.status}`,
    )
    if (h.nextBreakDue) parts.push(`- Next break due: ${h.nextBreakDue}`)
  }

  if (context.weather) {
    const w = context.weather
    parts.push(
      `- Weather: ${w.temp}°F, ${w.condition}, wind ${w.windSpeed}mph${w.windGusts ? ` (gusts ${w.windGusts}mph)` : ''}`,
    )
    if (w.visibility !== undefined) parts.push(`- Visibility: ${w.visibility} mi`)
    if (w.precipChance !== undefined) parts.push(`- Precip chance (next 2h): ${w.precipChance}%`)
    if (w.alerts?.length) parts.push(`- ⚠ Weather alerts: ${w.alerts.join('; ')}`)
  }

  if (context.fuel) {
    const f = context.fuel
    parts.push(
      `- Fuel: ${f.currentLevel}% | ${f.mpg} mpg | ${f.milesToEmpty} mi to empty`,
    )
    if (f.nearestStop) {
      parts.push(`- Nearest fuel stop: ${f.nearestStop.name} (${f.nearestStop.distanceMi} mi, $${f.nearestStop.dieselPrice}/gal)`)
    }
  }

  if (context.alerts?.length) {
    parts.push(`- Alerts: ${context.alerts.join(' | ')}`)
  }

  return parts.join('\n')
}

function buildHistoryBlock(history?: CoPilotQuery['history']): string {
  if (!history?.length) return ''

  return (
    '\n## Conversation History (last 5 messages)\n' +
    history.slice(-5).map(
      h =>
        `**${h.role === 'driver' ? 'Driver' : 'Fleet Commander AI'}** (${h.timestamp}): ${h.message}`,
    ).join('\n')
  )
}

// ── Query the AI Co-Pilot ────────────────────────────────────────────────────

/**
 * Send a query to the Fleet Commander AI Co-Pilot.
 * Uses the available LLM provider (Anthropic preferred) with full context.
 */
export async function queryCoPilot(query: CoPilotQuery): Promise<CoPilotResponse> {
  const provider = getProvider()
  const apiKey = getAPIKey()

  if (!apiKey) {
    return {
      answer: "Fleet Commander AI hasn't been configured yet. Ask your fleet manager to set up the API key in the settings.",
      actions: [{ label: 'Go to Settings', action: 'navigate', params: { to: '/settings' } }],
    }
  }

  const contextBlock = buildContextBlock(query.context)
  const historyBlock = buildHistoryBlock(query.history)

  const userMessage = `${contextBlock}\n${historyBlock}\n\n## Driver's Question\n${query.query}`

  try {
    if (provider === 'anthropic') {
      return await queryAnthropic(userMessage)
    } else {
      return await queryOpenAI(userMessage)
    }
  } catch (err) {
    logger.error('[AI Co-Pilot] Query failed:', err)
    return {
      answer: "Sorry, I had trouble processing that. Let me try a simpler response.\n\nI can help with route questions, fuel stops, DOT regulations, or HOS rules. Could you rephrase what you need?",
      data: { error: String(err) },
    }
  }
}

async function queryAnthropic(userMessage: string): Promise<CoPilotResponse> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model: AI_CONFIG.model,
    max_tokens: AI_CONFIG.maxTokens,
    temperature: AI_CONFIG.temperature,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  })

  const answer = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()

  return {
    answer,
    // Try to parse structured data from the response for UI rendering
    data: extractStructuredData(answer),
    sources: [],
  }
}

async function queryOpenAI(userMessage: string): Promise<CoPilotResponse> {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: AI_CONFIG.maxTokens,
    temperature: AI_CONFIG.temperature,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  })

  const answer = response.choices?.[0]?.message?.content?.trim() ?? ''

  return {
    answer,
    data: extractStructuredData(answer),
    sources: [],
  }
}

// ── Structured Data Extraction ───────────────────────────────────────────────

/**
 * Try to extract structured data from the AI response for UI rendering.
 * Looks for JSON blocks in the response.
 */
function extractStructuredData(answer: string): Record<string, unknown> | undefined {
  const jsonMatch = answer.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  if (!jsonMatch) return undefined

  try {
    return JSON.parse(jsonMatch[1])
  } catch {
    return undefined
  }
}

// ── Quick query shortcuts ────────────────────────────────────────────────────

/**
 * Quick HOS check — shortcut for common HOS questions.
 */
export async function checkHOS(context: CoPilotContext): Promise<CoPilotResponse> {
  if (!context.hos) {
    return {
      answer: 'No HOS data available. Make sure your ELD is connected and you have an active trip.',
    }
  }

  const h = context.hos
  let answer = ''

  if (h.hoursRemaining <= 0) {
    answer = `🛑 OUT OF HOURS. You've used all ${h.hoursDriven.toFixed(1)} hours today. You need ${h.status === 'driving' ? 'an immediate 10-hour break' : 'off-duty time'} before driving again.`
  } else if (h.hoursRemaining <= 1) {
    answer = `⚠ Only ${h.hoursRemaining.toFixed(1)}h of drive time left today. Start looking for parking — you'll need to stop soon.`
  } else if (h.hoursRemaining <= 3) {
    answer = `You have ${h.hoursRemaining.toFixed(1)}h left. Plan your next fuel/parking stop. You'll need a 10-hour reset in about ${Math.floor(h.hoursRemaining * 60)} min.`
  } else {
    answer = `✅ ${h.hoursRemaining.toFixed(1)}h remaining today. You're in good shape.`
  }

  // Add cycle info
  if (h.cycleHoursRemaining <= 0) {
    answer += `\n\n❌ 70-HOUR CYCLE VIOLATION. You've used all ${h.cycleHoursUsed}h this cycle. You need a 34-hour restart.`
  } else if (h.cycleHoursRemaining <= 5) {
    answer += `\n\n⚠ Cycle warning: only ${h.cycleHoursRemaining.toFixed(1)}h left in your 70-hour cycle. Plan a 34-hour reset soon.`
  }

  return { answer }
}

/**
 * Quick weather check along the route.
 */
export async function checkWeather(context: CoPilotContext): Promise<CoPilotResponse> {
  const w = context.weather
  if (!w) {
    return {
      answer: 'Weather data isn\'t available right now. Enable location services or check the weather dashboard.',
    }
  }

  const alerts = w.alerts?.length ? `\n\n⚠ WEATHER ALERTS: ${w.alerts.join('; ')}` : ''
  const windWarn = w.windGusts && w.windGusts > 40
    ? '\n\n⚠ HIGH WINDS: Gusts over 40mph. Reduce speed, watch for blow-over risk (especially empty trailers and box trucks).'
    : w.windGusts && w.windGusts > 30
    ? '\n\nNote: Gusty conditions (30+ mph). Secure loose tarps and watch crosswinds.'
    : ''
  const visWarn = w.visibility !== undefined && w.visibility < 1
    ? '\n\n⚠ LOW VISIBILITY: Under 1 mile. Use fog lights, reduce speed, consider pulling off if it drops further.'
    : ''
  const precipWarn = w.precipChance && w.precipChance > 50
    ? '\n\nRain likely in the next couple hours. Wet roads = longer stopping distance.'
    : ''

  const answer = `Current conditions: ${w.temp}°F, ${w.condition}, wind ${w.windSpeed}mph${w.windGusts ? ` (gusts ${w.windGusts})` : ''}.${alerts}${windWarn}${visWarn}${precipWarn}`

  return { answer }
}

/**
 * Quick fuel stop recommendation.
 */
export async function checkFuel(context: CoPilotContext): Promise<CoPilotResponse> {
  const f = context.fuel
  if (!f) {
    return { answer: 'Fuel data isn\'t available. Check your fuel gauge or fleet monitoring system.' }
  }

  const range = f.milesToEmpty
  let answer = `⛽ ${f.currentLevel}% fuel | ${f.mpg} mpg | ${range} mi range remaining.`

  if (range < 50) {
    answer += '\n\n🛑 CRITICAL: Find fuel NOW. You\'re running on fumes.'
  } else if (range < 150) {
    answer += '\n\n⚠ Low fuel. Start looking for a stop within the next hour.'
  } else {
    answer += '\n\nYou have plenty of range. Plan your stop strategically when fuel is cheap.'
  }

  if (f.nearestStop) {
    answer += `\n\nNearest: ${f.nearestStop.name} — ${f.nearestStop.distanceMi} mi away, $${f.nearestStop.dieselPrice}/gal`
  }

  return { answer }
}