// ============================================================
// Edge Function: ai-copilot
// AI-powered co-pilot for CDL drivers. Answers questions,
// provides route advice, interprets HOS rules, suggests fuel
// stops, and assists with trip planning.
//
// Called from: AI Co-pilot chat interface in the dashboard
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.0'
import { OpenAI } from 'https://esm.sh/openai@4.20.0'

interface CopilotRequest {
  message: string
  userId: string
  businessId?: string
  context?: {
    currentLoadId?: string
    currentLocation?: string
    destination?: string
    hosRemaining?: { drive: number; onDuty: number; cycle: number }
    fuelLevel?: string
  }
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}

serve(async (req: Request) => {
  try {
    const { message, userId, businessId, context, conversationHistory }: CopilotRequest = await req.json()

    if (!message || !userId) {
      return new Response(JSON.stringify({ error: 'message and userId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get OpenAI key
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Gather driver context from database
    let driverProfile = null
    let activeLoad = null
    let recentHosLogs = null
    let recentFuelPurchases = null

    if (userId) {
      // Get driver profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, tractor_number, cdl_number')
        .eq('id', userId)
        .single()
      driverProfile = profile

      // Get active load
      const { data: load } = await supabase
        .from('fleet_loads')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['active', 'en_route', 'at_pickup', 'loaded', 'en_route_delivery', 'at_delivery'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      activeLoad = load || null

      // Get today's HOS
      const { data: hosLogs } = await supabase
        .from('hos_logs')
        .select('duty_status, changed_at, location_name')
        .eq('user_id', userId)
        .gte('changed_at', new Date(Date.now() - 86400000 * 2).toISOString())
        .order('changed_at', { ascending: false })
        .limit(50)
      recentHosLogs = hosLogs || []

      // Get recent fuel purchases
      const { data: fuel } = await supabase
        .from('fleet_fuel_purchases')
        .select('station_name, location, gallons, price_per_gallon, transaction_date')
        .eq('user_id', userId)
        .order('transaction_date', { ascending: false })
        .limit(5)
      recentFuelPurchases = fuel || []
    }

    // Build system prompt with context
    const systemPrompt = `You are an AI co-pilot for CDL truck drivers using the 3B Fleet Commander app.
You help drivers with:
1. Hours of Service (HOS) rules — explain FMCSA regulations
2. Trip planning and routing advice
3. Fuel stop recommendations based on price and location
4. Load management and dispatch coordination
5. Vehicle inspection guidance (pre-trip/post-trip)
6. Safety tips and best practices
7. Interpreting DOT regulations
8. Detention and broker communication advice

Keep responses concise and practical — drivers need quick answers.
Reference the driver's context when available.

CURRENT DRIVER CONTEXT:
${driverProfile ? `Driver: ${driverProfile.first_name} ${driverProfile.last_name}\nTractor: ${driverProfile.tractor_number || 'Not set'}` : 'Not logged in'}

${activeLoad ? `ACTIVE LOAD:\n  From: ${activeLoad.origin}\n  To: ${activeLoad.destination}\n  Status: ${activeLoad.status}\n  Load #: ${activeLoad.load_number}\n  Pickup by: ${activeLoad.pickup_appt || 'Not set'}\n  Delivery by: ${activeLoad.delivery_appt || 'Not set'}` : 'No active load'}

${context?.hosRemaining ? `HOS REMAINING:\n  Driving: ${context.hosRemaining.drive} hours\n  On-Duty: ${context.hosRemaining.onDuty} hours\n  Cycle: ${context.hosRemaining.cycle} hours` : recentHosLogs.length > 0 ? `RECENT HOS: ${recentHosLogs.length} log entries in last 48 hours` : 'No recent HOS data'}

${context?.fuelLevel ? `FUEL LEVEL: ${context.fuelLevel}` : recentFuelPurchases?.length ? `LAST FUEL STOP: ${recentFuelPurchases[0]?.station_name || 'Unknown'} - ${recentFuelPurchases[0]?.price_per_gallon ? '$' + recentFuelPurchases[0].price_per_gallon + '/gal' : ''}` : 'No fuel data'}

${context?.currentLocation ? `CURRENT LOCATION: ${context.currentLocation}` : ''}
${context?.destination ? `DESTINATION: ${context.destination}` : ''}

ONLY answer trucking and fleet-related questions. For non-trucking questions, politely redirect.`

    // Build messages array
    const messages: any[] = [{ role: 'system', content: systemPrompt }]

    // Add conversation history (last 10 messages)
    if (conversationHistory && conversationHistory.length > 0) {
      const recent = conversationHistory.slice(-10)
      for (const msg of recent) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    // Add current message
    messages.push({ role: 'user', content: message })

    // Call OpenAI
    const openai = new OpenAI({ apiKey: openaiKey })
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',  // Faster, cheaper for chat
      messages,
      max_tokens: 2000,
      temperature: 0.3,
    })

    const reply = response.choices[0]?.message?.content || 'I apologize, I could not process that request.'

    return new Response(JSON.stringify({
      success: true,
      reply,
      model: 'gpt-4o-mini',
      usage: response.usage,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('AI copilot error:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})