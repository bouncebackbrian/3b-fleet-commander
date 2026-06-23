// ============================================================
// Edge Function: emergency-alert
// Handles emergency event notifications, escalation, and
// response coordination for fleet emergencies.
//
// On call: sends SMS to emergency contacts, creates dispatch
// alerts, logs the event, and auto-escalates based on severity.
//
// Called from: Emergency button / AI co-pilot emergency command
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.0'

interface EmergencyAlertRequest {
  emergencyEventId: string  // ID of the already-inserted fleet_emergency_events row
  userId: string
  notifyContacts?: boolean  // Whether to send SMS/notify emergency contacts
}

serve(async (req: Request) => {
  try {
    const { emergencyEventId, userId, notifyContacts = true }: EmergencyAlertRequest = await req.json()

    if (!emergencyEventId || !userId) {
      return new Response(JSON.stringify({ error: 'emergencyEventId and userId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // ── 1. Get the emergency event details ─────────────────
    const { data: event, error: eventError } = await supabase
      .from('fleet_emergency_events')
      .select('*, driver:driver_id(first_name, last_name, phone), equipment:equipment_id(unit_number)')
      .eq('id', emergencyEventId)
      .single()

    if (eventError || !event) {
      return new Response(JSON.stringify({
        error: 'Emergency event not found',
        details: eventError?.message,
      }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }

    // ── 2. Get driver details ──────────────────────────────
    const { data: driverProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name, phone, email')
      .eq('id', userId)
      .single()

    if (event.status === 'reported') {
      // Auto-acknowledge
      await supabase
        .from('fleet_emergency_events')
        .update({
          status: 'acknowledged',
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', emergencyEventId)
    }

    // ── 3. Create a fleet alert for dispatch ───────────────
    const alertSeverity = event.severity === 'critical' ? 'critical'
      : event.severity === 'high' ? 'urgent'
      : event.severity === 'medium' ? 'warning'
      : 'info'

    const { data: alert } = await supabase
      .from('fleet_alerts')
      .insert({
        load_number: null,
        tier: alertSeverity,
        category: 'driver',
        title: `🚨 ${event.emergency_type.replace(/_/g, ' ').toUpperCase()} — ${driverProfile?.first_name || 'Unknown'} ${driverProfile?.last_name || 'Driver'}`,
        body: `${event.description}\n\nLocation: ${event.location_name || 'Unknown'}`,
        action_label: 'View Emergency',
        confidence: 1.0,
        user_id: userId,
      })
      .select('id')
      .single()

    // ── 4. Notify emergency contacts via SMS ───────────────
    const notifications: Array<{ contact: string; status: string; error?: string }> = []

    if (notifyContacts && event.business_id) {
      // Get emergency contacts for this business
      const { data: contacts } = await supabase
        .from('fleet_emergency_contacts')
        .select('*')
        .eq('business_id', event.business_id)
        .eq('is_active', true)
        .order('priority', { ascending: true })

      if (contacts && contacts.length > 0) {
        const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
        const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN')
        const twilioFromNumber = Deno.env.get('TWILIO_FROM_NUMBER')

        if (twilioAccountSid && twilioAuthToken && twilioFromNumber) {
          for (const contact of contacts) {
            if (!contact.phone) continue

            const message = `🚨 FLEET EMERGENCY — ${event.emergency_type.replace(/_/g, ' ').toUpperCase()}
Driver: ${driverProfile?.first_name || 'Unknown'} ${driverProfile?.last_name || ''}
Location: ${event.location_name || 'Unknown location'}
Severity: ${event.severity.toUpperCase()}
Description: ${event.description}
${event.police_on_scene ? 'Police on scene' : ''}
${event.injuries ? 'Injuries reported' : ''}

Reply or contact dispatch immediately.`

            try {
              const smsResponse = await fetch(
                `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
                  },
                  body: new URLSearchParams({
                    To: contact.phone,
                    From: twilioFromNumber,
                    Body: message.substring(0, 1600),
                  }),
                }
              )

              if (smsResponse.ok) {
                notifications.push({ contact: contact.contact_name, status: 'sent' })
              } else {
                const smsError = await smsResponse.text()
                notifications.push({ contact: contact.contact_name, status: 'failed', error: smsError })
              }
            } catch (smsError) {
              notifications.push({
                contact: contact.contact_name,
                status: 'failed',
                error: smsError instanceof Error ? smsError.message : String(smsError),
              })
            }
          }
        } else {
          notifications.push({
            contact: 'Twilio not configured',
            status: 'skipped',
            error: 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER not set',
          })
        }
      }
    }

    // ── 5. Return results ──────────────────────────────────
    return new Response(JSON.stringify({
      success: true,
      eventId: emergencyEventId,
      alertId: alert?.id,
      status: event.status === 'reported' ? 'acknowledged' : event.status,
      notifications,
      summary: {
        emergencyType: event.emergency_type,
        severity: event.severity,
        driverName: `${driverProfile?.first_name || ''} ${driverProfile?.last_name || ''}`.trim(),
        location: event.location_name,
        notified: notifications.filter(n => n.status === 'sent').length,
        failed: notifications.filter(n => n.status === 'failed').length,
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Emergency alert error:', error)
    return new Response(JSON.stringify({
      error: 'Failed to process emergency alert',
      details: error instanceof Error ? error.message : String(error),
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})