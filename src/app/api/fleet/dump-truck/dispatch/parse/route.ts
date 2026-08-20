/**
 * POST /api/fleet/dump-truck/dispatch/parse — AI dispatch intake text extraction
 *
 * Hector pastes or types incoming job info; this route uses Claude
 * (text-only, same pattern as /api/fleet/dump-truck/scan-site's textPrompt)
 * to pull out structured fields + a per-field confidence rating. It never
 * resolves locations to coordinates itself — that's resolveLocationText()
 * in the service layer, against real sites/geocoding, so the AI can't
 * hallucinate a jobsite's GPS position. It never invents facts not present
 * in the text: anything not stated comes back null with low confidence.
 *
 * Dispatch/admin manage-level only — this is the intake step of a
 * payroll/dispatch-affecting workflow, not a driver action.
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'

export type FieldConfidence = 'high' | 'medium' | 'low'

export interface ParsedDispatchFields {
  customerName: string | null
  brokerName: string | null
  jobName: string | null
  jobNumber: string | null
  dispatchContactName: string | null
  dispatchContactPhone: string | null
  driverName: string | null
  truckLabel: string | null
  dispatchDate: string | null // YYYY-MM-DD
  requiredArrivalTime: string | null // HH:MM 24h, local to the job
  yard: string | null
  startingLocation: string | null
  pickupLocation: string | null
  deliveryLocation: string | null
  material: string | null
  estimatedQuantity: string | null
  numLoads: number | null
  weightRequirements: string | null
  ticketRequirements: string | null
  scaleRequired: boolean | null
  poNumber: string | null
  loadNumber: string | null
  specialInstructions: string | null
  gateInstructions: string | null
  contactOnArrivalInstructions: string | null
  safetyInstructions: string | null
  truckRestrictions: string | null
  trailerRequirements: string | null
  returnInstructions: string | null
  estJobDurationMinutes: number | null
  rateType: 'hourly' | 'per_load' | null
  customerRate: number | null
  driverPayRule: string | null
  notes: string | null
}

export interface ParseDispatchResponse {
  parsed: ParsedDispatchFields
  confidence: Record<string, FieldConfidence>
  warnings: string[]
}

const FIELD_KEYS = [
  'customerName', 'brokerName', 'jobName', 'jobNumber', 'dispatchContactName', 'dispatchContactPhone',
  'driverName', 'truckLabel', 'dispatchDate', 'requiredArrivalTime', 'yard', 'startingLocation',
  'pickupLocation', 'deliveryLocation', 'material', 'estimatedQuantity', 'numLoads', 'weightRequirements',
  'ticketRequirements', 'scaleRequired', 'poNumber', 'loadNumber', 'specialInstructions', 'gateInstructions',
  'contactOnArrivalInstructions', 'safetyInstructions', 'truckRestrictions', 'trailerRequirements',
  'returnInstructions', 'estJobDurationMinutes', 'rateType', 'customerRate', 'driverPayRule', 'notes',
] as const

const JSON_SHAPE = `{
  "parsed": {
    "customerName": string or null,
    "brokerName": string or null,
    "jobName": string or null,
    "jobNumber": string or null,
    "dispatchContactName": string or null,
    "dispatchContactPhone": string or null,
    "driverName": string or null,
    "truckLabel": string or null (e.g. "06", "Truck 07"),
    "dispatchDate": "YYYY-MM-DD" or null,
    "requiredArrivalTime": "HH:MM" 24-hour or null,
    "yard": string or null (only if a specific yard other than the default was named),
    "startingLocation": string or null,
    "pickupLocation": string or null,
    "deliveryLocation": string or null,
    "material": string or null,
    "estimatedQuantity": string or null,
    "numLoads": integer or null,
    "weightRequirements": string or null,
    "ticketRequirements": string or null,
    "scaleRequired": boolean or null,
    "poNumber": string or null,
    "loadNumber": string or null,
    "specialInstructions": string or null,
    "gateInstructions": string or null,
    "contactOnArrivalInstructions": string or null,
    "safetyInstructions": string or null,
    "truckRestrictions": string or null,
    "trailerRequirements": string or null,
    "returnInstructions": string or null,
    "estJobDurationMinutes": integer or null,
    "rateType": "hourly" | "per_load" | null,
    "customerRate": number or null,
    "driverPayRule": string or null,
    "notes": string or null
  },
  "confidence": {
    // one of "high" | "medium" | "low" for EVERY key above that is non-null in "parsed".
    // Omit keys that are null in "parsed".
  },
  "warnings": [ "short strings flagging anything important that is missing, ambiguous, or should be double-checked before publishing" ]
}`

function buildPrompt(source: string, todayIso: string, knownDrivers: string, knownTrucks: string): string {
  return `You are extracting a structured dispatch assignment from a message a dump-truck
dispatcher (Hector, at Cal-Neva Trucking) typed, pasted, or dictated. Today's
date is ${todayIso}. Resolve relative dates ("tomorrow", "Monday") against
that. Known drivers and their DEFAULT truck (only a default — the message may
override it): ${knownDrivers || 'none on file yet'}. Known trucks: ${knownTrucks || 'none on file yet'}.

${source}

Extract ONLY what is actually stated or clearly implied by the message. Do
NOT invent an address, phone number, time, quantity, or any other fact that
is not present in the text — leave it null instead, and add a warning if it
is an important field to be missing (date, driver, truck, first required
location, required arrival time). Do not resolve place names to addresses or
coordinates yourself — just capture the wording the dispatcher used
(e.g. "Lockwood", "White Fir yard", "XYZ pit") in the matching field; a
separate step matches that text against real sites.

If the message gives a driver's name that matches one of the known drivers
and does not separately specify a truck, you may leave truckLabel null and
note in a warning that the known default truck should be used unless
overridden — do not guess a truck number that isn't stated or a known
default.

Return ONLY a valid JSON object — no markdown, no explanation, no extra text.
Return this exact JSON shape:
${JSON_SHAPE}

Return ONLY the JSON — nothing else.`
}

function parseModelJson(raw: string): ParseDispatchResponse | { error: string } {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(cleaned)
}

function textSource(text: string): string {
  return `Message:\n"""\n${text}\n"""`
}

function screenshotSource(caption: string | null): string {
  return `The message is a screenshot (attached below) — a text message, email, or note`
    + ` containing the dispatch job info. Read whatever text is visible in the image.`
    + (caption ? `\n\nThe dispatcher also added this note alongside the screenshot: "${caption}"` : '')
}

async function callClaude(
  client: Anthropic, prompt: string, image: { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' } | null,
) {
  const content: Anthropic.MessageParam['content'] = image
    ? [{ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } }, { type: 'text', text: prompt }]
    : prompt
  return client.messages.create({ model: 'claude-opus-4-7', max_tokens: 1536, messages: [{ role: 'user', content }] })
}

export async function POST(req: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })

  const contentType = req.headers.get('content-type') ?? ''
  const todayIso = new Date().toISOString().slice(0, 10)
  const client = new Anthropic({ apiKey })

  let prompt: string
  let image: { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' } | null = null
  let rawInputForAudit: string

  if (contentType.includes('multipart/form-data')) {
    // Screenshot mode — same shape as scan-site's file branch, but the whole
    // dispatch field set instead of just a location.
    const form = await req.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
    if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Unsupported file type. Use a screenshot.' }, { status: 400 })
    }
    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mediaType = (file.type === 'image/heic' || file.type === 'image/heif')
      ? 'image/jpeg' : (file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif')
    image = { base64, mediaType }

    const caption = typeof form.get('text') === 'string' ? String(form.get('text')).trim() || null : null
    const knownDrivers = String(form.get('knownDrivers') ?? '')
    const knownTrucks = String(form.get('knownTrucks') ?? '')
    prompt = buildPrompt(screenshotSource(caption), todayIso, knownDrivers, knownTrucks)
    rawInputForAudit = caption ? `[Screenshot] ${caption}` : '[Parsed from screenshot]'
  } else {
    const body = await req.json().catch(() => null)
    const text = body?.text
    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }
    const knownDrivers: string = Array.isArray(body?.knownDrivers) ? body.knownDrivers.join('; ') : ''
    const knownTrucks: string = Array.isArray(body?.knownTrucks) ? body.knownTrucks.join(', ') : ''
    prompt = buildPrompt(textSource(text), todayIso, knownDrivers, knownTrucks)
    rawInputForAudit = text
  }

  try {
    const message = await callClaude(client, prompt, image)
    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const data = parseModelJson(raw)
    if ('error' in data) return NextResponse.json({ error: data.error }, { status: 422 })

    // Defensive: guarantee every field key is present (null-filled) even if the model omitted one.
    const parsed = { ...Object.fromEntries(FIELD_KEYS.map(k => [k, null])), ...data.parsed } as ParsedDispatchFields
    const confidence = data.confidence ?? {}
    const warnings = Array.isArray(data.warnings) ? data.warnings : []

    return NextResponse.json({ parsed, confidence, warnings, rawInput: rawInputForAudit, model: message.model } as ParseDispatchResponse & { rawInput: string; model: string })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
