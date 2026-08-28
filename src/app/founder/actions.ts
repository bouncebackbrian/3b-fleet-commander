'use server'

import { revalidatePath } from 'next/cache'
import { requireFounder } from '@/lib/founder-auth'
import { fleetServiceClient } from '@/lib/fleet-service-client'

export async function setFleetAccountEnabled(formData: FormData) {
  const founder = await requireFounder()
  const businessId = String(formData.get('businessId') ?? '').trim()
  const enabled = String(formData.get('enabled') ?? '') === 'true'

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(businessId)) {
    throw new Error('Invalid business ID')
  }

  const { error } = await fleetServiceClient
    .from('businesses')
    .update({ has_fleet: enabled, updated_at: new Date().toISOString() })
    .eq('id', businessId)

  if (error) throw new Error(`Unable to update Fleet account: ${error.message}`)

  // Best-effort platform audit. This must never block the account update if an
  // older environment has not applied the fleet_audit_logs migration yet.
  try {
    await fleetServiceClient.from('fleet_audit_logs').insert({
      business_id: businessId,
      user_id: founder.userId,
      action: enabled ? 'founder_fleet_account_enabled' : 'founder_fleet_account_disabled',
      entity_type: 'business',
      entity_id: businessId,
      metadata: {
        source: 'founder_portal',
        founder_three_b_id: founder.threeBId,
      },
    })
  } catch {
    // The primary account change already succeeded.
  }

  revalidatePath('/founder')
  revalidatePath(`/founder/accounts/${businessId}`)
}
