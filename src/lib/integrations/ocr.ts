/**
 * OCR — Integration Service Module
 *
 * Unified document processing for the Fleet Commander app.
 * Handles OCR processing for:
 *   - Fuel receipts (extract gallons, price, location)
 *   - Bill of Lading / Proof of Delivery documents
 *   - Compliance documents (medical cards, licenses)
 *
 * Uses Anthropic Claude Vision for all OCR processing.
 */

import { logger } from '@/lib/logger'

// ── Types ────────────────────────────────────────────────────────────────────

export interface FuelReceiptData {
  date: string | null               // YYYY-MM-DD
  time: string | null               // HH:MM
  fuelStopName: string | null
  fuelStopChain: string | null      // 'Loves' | 'Pilot' | 'FlyingJ' | 'TA' | etc.
  address: string | null
  city: string | null
  state: string | null
  fuelType: string | null           // 'diesel' | 'def' | 'reefer' | 'other'
  gallons: number | null
  pricePerGal: number | null
  totalCost: number | null
  truckNumber: string | null
  odometer: number | null
  transactionId: string | null
  cardLast4: string | null
  notes: string | null
}

export interface BOLData {
  loadNumber: string | null
  bolNumber: string | null
  broker: string | null
  shipper: string | null
  origin: string | null            // "City, ST"
  originAddress: string | null
  originPhone: string | null
  consignee: string | null
  destination: string | null       // "City, ST"
  destAddress: string | null
  destPhone: string | null
  stops: BOLStop[]
  commodity: string | null
  weight: string | null
  pieces: string | null
  grossRate: string | null
  miles: string | null
  pickupDate: string | null
  deliveryDate: string | null
  poNumber: string | null
  notes: string | null
}

export interface BOLStop {
  sequence: number
  type: 'pickup' | 'delivery' | 'relay'
  name: string | null
  address: string | null
  city: string | null
  state: string | null
  phone: string | null
  reference: string | null
  appt: string | null
}

export interface ComplianceDocData {
  /** Type of compliance document */
  docType: 'medical' | 'license' | 'insurance' | 'permit' | 'other'
  /** Driver name */
  name: string | null
  /** Date of issue */
  issueDate: string | null
  /** Expiration date */
  expirationDate: string | null
  /** Issuing authority / state */
  issuer: string | null
  /** License / document number */
  documentNumber: string | null
  /** Class (for CDL: A, B, C) */
  class?: string | null
  /** Endorsements (H, N, T, X, P, S) */
  endorsements?: string | null
  /** Restrictions */
  restrictions?: string | null
  /** Date of birth */
  dob?: string | null
  /** Notes */
  notes: string | null
}

export interface OCRResult<T> {
  success: boolean
  data: T | null
  error?: string
  raw?: string // Raw AI response for debugging
}

/** Supported image types for OCR */
const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const

// ── OCR Processor ────────────────────────────────────────────────────────────

class OCRProcessor {
  private apiKey: string

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  }

  get isConfigured(): boolean {
    return !!this.apiKey
  }

  /**
   * Validate file type and convert to supported format.
   */
  private validateImage(file: File): { valid: boolean; error?: string; mediaType: string } {
    const type = file.type as string

    if (type === 'image/heic' || type === 'image/heif') {
      return { valid: true, mediaType: 'image/jpeg' }
    }

    if (SUPPORTED_MIME_TYPES.includes(type as typeof SUPPORTED_MIME_TYPES[number])) {
      return { valid: true, mediaType: type }
    }

    if (type.startsWith('image/')) {
      return { valid: true, mediaType: 'image/jpeg' } // Accept any image type, default to jpeg
    }

    return {
      valid: false,
      error: 'Unsupported file type. Please upload an image (JPEG, PNG, WebP, or HEIC).',
      mediaType: '',
    }
  }

  /**
   * Convert File to base64 for API call.
   */
  private async fileToBase64(file: File): Promise<string> {
    const bytes = await file.arrayBuffer()
    return Buffer.from(bytes).toString('base64')
  }

  /**
   * Clean markdown code fences from AI response.
   */
  private cleanResponse(raw: string): string {
    return raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
  }

  /**
   * Process any document image with a custom prompt.
   */
  async process<T>(
    file: File,
    prompt: string,
    maxTokens = 512,
  ): Promise<OCRResult<T>> {
    if (!this.isConfigured) {
      return {
        success: false,
        data: null,
        error: 'ANTHROPIC_API_KEY not configured. OCR is unavailable.',
      }
    }

    const validation = this.validateImage(file)
    if (!validation.valid) {
      return { success: false, data: null, error: validation.error }
    }

    try {
      const base64 = await this.fileToBase64(file)
      const mediaType = validation.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey: this.apiKey })

      const message = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: maxTokens,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      })

      const raw = message.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('')
        .trim()

      const cleaned = this.cleanResponse(raw)

      try {
        const data = JSON.parse(cleaned) as T
        return { success: true, data, raw }
      } catch {
        return {
          success: false,
          data: null,
          error: 'Could not parse the extracted data. The image may be unclear.',
          raw,
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown OCR error'
      logger.error('[OCR] Processing error:', err)
      return { success: false, data: null, error: msg }
    }
  }

  // ── Specialized OCR methods ──────────────────────────────────────────────────

  /**
   * Extract fuel receipt data from an image.
   */
  async processFuelReceipt(file: File): Promise<OCRResult<FuelReceiptData>> {
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

    return this.process<FuelReceiptData>(file, PROMPT)
  }

  /**
   * Extract Bill of Lading data from a document image.
   */
  async processBOL(file: File): Promise<OCRResult<BOLData>> {
    const PROMPT = `You are reading a photo of a Bill of Lading (BOL) or rate confirmation document used in freight trucking.

Extract every field you can see and return ONLY a valid JSON object — no markdown, no explanation.

{
  "loadNumber":    "load or pro number (string or null)",
  "bolNumber":     "BOL reference number if different from load number (string or null)",
  "broker":        "broker or carrier name (string or null)",
  "shipper":       "shipper/sender company name (string or null)",
  "origin":        "pickup city and state as 'City, ST' (string or null)",
  "originAddress": "full pickup street address (string or null)",
  "originPhone":   "pickup facility phone number (string or null)",
  "consignee":     "receiver/consignee company name at delivery (string or null)",
  "destination":   "delivery city and state as 'City, ST' (string or null)",
  "destAddress":   "full delivery street address (string or null)",
  "destPhone":     "delivery facility phone number (string or null)",
  "stops": [ { "sequence": number, "type": "pickup"|"delivery"|"relay", "name", "address", "city", "state", "phone", "reference", "appt" } ],
  "commodity":     "description of freight/goods (string or null)",
  "weight":        "total weight in lbs (string or null)",
  "pieces":        "number of pieces/pallets/units (string or null)",
  "grossRate":     "total pay/rate in dollars, no $ sign (string or null)",
  "miles":         "loaded miles if printed (string or null)",
  "pickupDate":    "pickup date/time if visible (string or null)",
  "deliveryDate":  "delivery date/time if visible (string or null)",
  "poNumber":      "PO or purchase order number (string or null)",
  "notes":         "special instructions, hazmat info, or notes (string or null)"
}

Rules:
- "stops" only for multi-stop routing (3+ location entries). Simple origin→destination = empty array [].
- Return only the JSON object. No extra text. Null for unseen fields.`

    return this.process<BOLData>(file, PROMPT, 600)
  }

  /**
   * Extract compliance document data (medical card, license, etc.).
   */
  async processComplianceDoc(
    file: File,
    docType: 'medical' | 'license' | 'insurance' | 'permit',
  ): Promise<OCRResult<ComplianceDocData>> {
    const typeName =
      docType === 'medical' ? 'Medical Examiner Certificate / DOT Medical Card' :
      docType === 'license' ? 'Commercial Driver License (CDL)' :
      docType === 'insurance' ? 'Insurance Certificate' : 'Operating Permit'

    const extraFields =
      docType === 'license'
        ? `  "class": "CDL class: A, B, C or null",
  "endorsements": "e.g. H, N, T, X, P, S combined as string or null",
  "restrictions": "e.g. E, K, L, Z combined as string or null",
  "dob": "date of birth or null",`
        : ''

    const PROMPT = `You are reading a photo of a ${typeName} document.

Return ONLY a valid JSON object — no markdown, no explanation.

{
  "docType": "${docType}",
  "name": "full name on document (string or null)",
  "issueDate": "issue/date of document (string or null)",
  "expirationDate": "expiration date (string or null)",
  "issuer": "issuing authority / state (string or null)",
  "documentNumber": "document ID or license number (string or null)",
  ${extraFields}
  "notes": "any other observations (string or null)"
}

Rules:
- Return only the JSON object.
- Use null for missing fields.`

    return this.process<ComplianceDocData>(file, PROMPT, 500)
  }
}

// ── Singleton export ─────────────────────────────────────────────────────────

/** Shared OCR processor instance */
export const ocr = new OCRProcessor()

// ── Documentation scan helper ────────────────────────────────────────────────

/**
 * Quick check if OCR is available (API key configured).
 */
export function isOCRConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

/**
 * Determine the document type from file context.
 * Useful for routing uploads to the right processor.
 */
export function detectDocumentType(fileName: string): 'receipt' | 'bol' | 'compliance' | 'unknown' {
  const name = fileName.toLowerCase()
  if (name.includes('receipt') || name.includes('fuel') || name.includes('payment')) return 'receipt'
  if (name.includes('bol') || name.includes('bill') || name.includes('rate') || name.includes('pod')) return 'bol'
  if (name.includes('medic') || name.includes('license') || name.includes('cdl') || name.includes('permit')) return 'compliance'
  return 'unknown'
}