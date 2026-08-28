/**
 * /api/fleet/me — resolve the caller's Fleet identity (business, role, portal grants)
 *
 * Core_Eco owns auth/session. Fleet DB owns operational membership, portals,
 * assets and trucking-mode context.
 */

import { NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { fleetServiceClient } from '@/lib/fleet-service-client'
import { getEffectiveOpsProfileForDriver } from '@/lib/fleet/dumpTruck/shared'
import { getCurrentDriverAsset } from '@/lib/fleet/asset-context'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ user: null })

  const [{ data: business }, { data: profile }, currentAsset] = await Promise.all([
    fleetServiceClient.from('businesses').select('slug, type, ops_profile').eq('id', auth.businessId).maybeSingle(),
    fleetServiceClient.from('profiles').select('preferred_language').eq('id', auth.userId).maybeSingle(),
    getCurrentDriverAsset(auth.businessId, auth.userId),
  ])

  // Legacy business default remains only as a compatibility fallback for old
  // navigation. Operational trucking mode is resolved from the asset itself.
  const opsProfile: 'otr' | 'dump_truck' = business?.ops_profile === 'dump_truck' ? 'dump_truck' : 'otr'
  const driverOpsProfile = await getEffectiveOpsProfileForDriver(auth.businessId, auth.userId, opsProfile)

  return NextResponse.json({
    user: {
      id:           auth.userId,
      email:        auth.email,
      businessId:   auth.businessId,
      businessSlug: business?.slug ?? null,
      businessType: business?.type ?? null,
      opsProfile,
      driverOpsProfile,
      currentAsset,
      role:         auth.role,
      portals:      auth.portals,
      preferredLanguage: profile?.preferred_language === 'es' ? 'es' : 'en',
    },
  })
}
