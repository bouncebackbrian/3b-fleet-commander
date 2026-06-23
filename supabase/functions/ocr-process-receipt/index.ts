// ============================================================
// Edge Function: ocr-process-receipt
// Processes receipt images via OCR, extracts structured data,
// and stores the result in fleet_fuel_purchases or expenses.
//
// Called from: Fuel tab / Expenses tab (receipt upload)
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.0'
import { OpenAI } from 'https://esm.sh/openai@4.20.0'

interface OCRRequest {
  storagePath: string    // Path in receipts_ocr bucket
  bucketName: string     // Which bucket the image is in
  userId: string
  businessId?: string
}

interface OCRResult {
  vendorName?: string
  transactionDate?: string
  totalAmount?: number
  fuelGallons?: number
  pricePerGallon?: number
  fuelType?: 'diesel' | 'reefer' | 'def' | 'gasoline'
  location?: string
  taxAmount?: number
  isFuelReceipt: boolean
  rawText?: string
}

serve(async (req: Request) => {
  try {
    // Parse request
    const { storagePath, bucketName, userId, businessId }: OCRRequest = await req.json()

    if (!storagePath || !userId) {
      return new Response(JSON.stringify({ error: 'storagePath and userId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Initialize Supabase client (service role for storage access)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get OpenAI API key
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Download the file from storage
    const bucket = bucketName || 'receipts_ocr'
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from(bucket)
      .download(storagePath)

    if (downloadError || !fileData) {
      return new Response(JSON.stringify({
        error: 'Failed to download file from storage',
        details: downloadError?.message,
      }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    // Process with OpenAI Vision
    const openai = new OpenAI({ apiKey: openaiKey })
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a receipt OCR processor for trucking fleet management.
Extract the following information from the receipt image and return as JSON:
- vendorName: the merchant or station name
- transactionDate: date on the receipt (ISO format YYYY-MM-DD)
- totalAmount: total amount paid
- fuelGallons: if it's a fuel receipt, number of gallons
- pricePerGallon: price per gallon if fuel receipt
- fuelType: "diesel" | "reefer" | "def" | "gasoline" | null
- location: city, state or address from receipt
- taxAmount: tax amount if shown
- isFuelReceipt: boolean - true if this is clearly a fuel/def purchase
- rawText: any additional text you can read from the receipt

Only return valid JSON. If uncertain about a field, return null for that field.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.1,
    })

    const resultText = response.choices[0]?.message?.content
    if (!resultText) {
      return new Response(JSON.stringify({ error: 'OCR processing returned no result' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Parse JSON from response (handle markdown code blocks)
    let parsed: OCRResult
    try {
      const jsonMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, resultText]
      parsed = JSON.parse(jsonMatch[1].trim())
    } catch {
      return new Response(JSON.stringify({
        error: 'Failed to parse OCR result as JSON',
        raw: resultText,
      }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    // If it's a fuel receipt, auto-create a fuel purchase record
    if (parsed.isFuelReceipt && parsed.totalAmount && parsed.fuelGallons) {
      const { error: insertError } = await supabase
        .from('fleet_fuel_purchases')
        .insert({
          user_id: userId,
          business_id: businessId || null,
          fuel_type: (parsed.fuelType || 'tractor') as any,
          gallons: parsed.fuelGallons,
          price_per_gallon: parsed.pricePerGallon || (parsed.totalAmount / parsed.fuelGallons),
          total_cost: parsed.totalAmount,
          station_name: parsed.vendorName,
          location: parsed.location,
          transaction_date: parsed.transactionDate || new Date().toISOString().split('T')[0],
          receipt_saved: true,
          receipt_storage_path: storagePath,
          notes: `Auto-created from OCR on ${new Date().toISOString()}`,
          driver_id: userId,
        })

      if (insertError) {
        console.error('Failed to insert fuel purchase:', insertError)
      }
    }

    // Return the OCR result
    return new Response(JSON.stringify({
      success: true,
      data: parsed,
      autoCreated: parsed.isFuelReceipt && !!parsed.totalAmount,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('OCR processing error:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})