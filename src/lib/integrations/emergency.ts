/**
 * Emergency — Emergency & Roadside Alert Service Module
 *
 * Handles emergency notifications for roadside events:
 *   - Crash / accident alerts
 *   - Mechanical breakdown notifications
 *   - Personal emergency (driver health)
 *   - Weather-related emergencies
 *
 * Captures GPS coordinates at the time of the event and sends
 * alerts via multiple channels (SMS, email, dispatch relay).
 */

import { logger } from '@/lib/logger'

// ── Types ────────────────────────────────────────────────────────────────────

export type EmergencyType =
  | 'crash'
  | 'breakdown'
  | 'medical'
  | 'weather'
  | 'security'
  | 'hazmat_spill'
  | 'fire'
  | 'other'

export type EmergencySeverity = 'critical' | 'urgent' | 'moderate' | 'info'

export interface EmergencyEvent {
  id: string
  type: EmergencyType
  severity: EmergencySeverity
  timestamp: string
  location: {
    lat: number
    lng: number
    address?: string
    city?: string
    state?: string
    mileMarker?: string
    road?: string
  }
  driver: {
    id: string
    name: string
    phone: string
    truckNumber?: string
    carrier?: string
  }
  description: string
  dispatchNotified: boolean
  roadsideContacted: boolean
  caseNumber?: string
  channels: Array<'sms' | 'email' | 'dispatch_push'>
}

const SEVERITY_CHANNELS: Record<EmergencySeverity, Array<'sms' | 'email' | 'dispatch_push'>> = {
  critical: ['sms', 'email', 'dispatch_push'],
  urgent: ['sms', 'dispatch_push'],
  moderate: ['dispatch_push'],
  info: ['dispatch_push'],
}

// ── Emergency Service ────────────────────────────────────────────────────────

class EmergencyService {
  /**
   * Trigger an emergency alert.
   * Captures location, creates an event record, and sends notifications.
   */
  async triggerEmergency(params: {
    type: EmergencyType
    severity: EmergencySeverity
    description: string
    location: {
      lat: number
      lng: number
      address?: string
      mileMarker?: string
      road?: string
    }
    driver: {
      id: string
      name: string
      phone: string
      truckNumber?: string
      carrier?: string
    }
  }): Promise<EmergencyEvent> {
    const event: EmergencyEvent = {
      id: `em-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: params.type,
      severity: params.severity,
      timestamp: new Date().toISOString(),
      location: params.location,
      driver: params.driver,
      description: params.description,
      dispatchNotified: false,
      roadsideContacted: false,
      channels: [],
    }

    const channels = SEVERITY_CHANNELS[params.severity]
    event.channels = channels

    const results = await Promise.allSettled([
      ...(channels.includes('sms') ? [this.sendSMSAlert(event)] : []),
      ...(channels.includes('email') ? [this.sendEmailAlert(event)] : []),
      ...(channels.includes('dispatch_push') ? [this.notifyDispatch(event)] : []),
    ])

    event.dispatchNotified = results.some(
      r => r.status === 'fulfilled' && r.value?.includes('dispatch'),
    )
    event.roadsideContacted = results.some(
      r => r.status === 'fulfilled' && r.value?.includes('roadside'),
    )

    logger.info('[Emergency] Event created:', event.id)
    return event
  }

  private async sendSMSAlert(event: EmergencyEvent): Promise<string | null> {
    const endpoint = process.env.NEXT_PUBLIC_SMS_ENDPOINT
    if (!endpoint) {
      logger.warn('[Emergency] SMS endpoint not configured')
      return null
    }
    try {
      const message = this.formatSMS(event)
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: [event.driver.phone],
          message,
          priority: event.severity === 'critical' ? 'high' : 'normal',
        }),
      })
      return 'sms'
    } catch (err) {
      logger.error('[Emergency] SMS send failed:', err)
      return null
    }
  }

  private async sendEmailAlert(event: EmergencyEvent): Promise<string | null> {
    const endpoint = process.env.NEXT_PUBLIC_EMAIL_ENDPOINT
    if (!endpoint) {
      logger.warn('[Emergency] Email endpoint not configured')
      return null
    }
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: `[${event.severity.toUpperCase()}] ${event.type} — ${event.driver.name}`,
          body: this.formatEmail(event),
          priority: event.severity === 'critical' ? 'urgent' : 'normal',
        }),
      })
      return 'email'
    } catch (err) {
      logger.error('[Emergency] Email send failed:', err)
      return null
    }
  }

  private async notifyDispatch(event: EmergencyEvent): Promise<string | null> {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { error } = await supabase.from('dispatch_alerts').insert({
        type: 'emergency',
        emergency_type: event.type,
        severity: event.severity,
        driver_id: event.driver.id,
        driver_name: event.driver.name,
        location_lat: event.location.lat,
        location_lng: event.location.lng,
        description: event.description,
        timestamp: event.timestamp,
      })
      if (error) {
        logger.warn('[Emergency] Dispatch notification insert error:', error.message)
        await fetch('/api/dispatch/alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event }),
        })
      }
      return 'dispatch'
    } catch (err) {
      logger.error('[Emergency] Dispatch notification failed:', err)
      return null
    }
  }

  private formatSMS(event: EmergencyEvent): string {
    const loc =
      event.location.address ||
      [event.location.city, event.location.state].filter(Boolean).join(', ') ||
      `${event.location.lat.toFixed(4)}, ${event.location.lng.toFixed(4)}`
    const truckInfo = event.driver.truckNumber ? ` (Truck #${event.driver.truckNumber})` : ''
    return `[3B FLEET ALERT] ${event.severity.toUpperCase()}: ${event.type} — ${event.driver.name}${truckInfo} at ${loc}. ${event.description}`
  }

  private formatEmail(event: EmergencyEvent): string {
    return [
      `EMERGENCY ALERT — ${event.severity.toUpperCase()}`,
      '',
      `Type: ${event.type}`,
      `Driver: ${event.driver.name} (${event.driver.phone})`,
      event.driver.truckNumber ? `Truck: #${event.driver.truckNumber}` : '',
      event.driver.carrier ? `Carrier: ${event.driver.carrier}` : '',
      '',
      'Location:',
      `  Lat: ${event.location.lat}`,
      `  Lng: ${event.location.lng}`,
      event.location.address ? `  Address: ${event.location.address}` : '',
      event.location.mileMarker ? `  Mile Marker: ${event.location.mileMarker}` : '',
      event.location.road ? `  Road: ${event.location.road}` : '',
      '',
      `Description: ${event.description}`,
      '',
      `Event ID: ${event.id}`,
      `Timestamp: ${event.timestamp}`,
      `Channels: ${event.channels.join(', ')}`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  /** Generate a Google Maps link for emergency location */
  getMapLink(lat: number, lng: number): string {
    return `https://www.google.com/maps?q=${lat},${lng}`
  }

  /** Get roadside assistance contact numbers */
  getRoadsideContacts(): Array<{ name: string; phone: string }> {
    return [
      { name: "Love's Truck Care", phone: '1-800-OK-LOVES' },
      { name: 'Pilot Flying J Road Service', phone: '1-877-885-9273' },
      { name: 'TA/Petro Roadside', phone: '1-800-654-3256' },
      { name: 'FleetNet America', phone: '1-800-333-5555' },
    ]
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const emergency = new EmergencyService()

/** Lookup roadside phone by chain name */
export function getRoadsidePhone(chain: string): string | null {
  const map: Record<string, string> = {
    loves: '1-800-OK-LOVES',
    pilot: '1-877-885-9273',
    flyingj: '1-877-885-9273',
    ta: '1-800-654-3256',
    petro: '1-800-654-3256',
    speedco: '1-866-377-7332',
  }
  return map[chain.toLowerCase()] ?? null
}

/** Recommended truck emergency kit items */
export function getEmergencyKit(): string[] {
  return [
    'First aid kit',
    'Fire extinguisher (ABC rated)',
    'Reflective triangles (3)',
    'Reflective vest',
    'Flashlight + extra batteries',
    'Flares / road flares',
    'Basic tool kit (screwdrivers, pliers, wrenches)',
    'Zip ties and bungee cords',
    'Duct tape',
    'Tire pressure gauge',
    'Jumper cables',
    'Emergency blanket',
    'Bottled water (1 gal)',
    'Non-perishable snacks',
    'Phone charger / power bank',
    'Paper log sheets (if ELD fails)',
  ]
}