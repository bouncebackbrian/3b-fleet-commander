/**
 * /api/fleet/me — resolve the caller's Fleet identity (business, role, portal grants)
 *
 * Bug fix (2026-07-29): src/lib/auth-adapter.ts's getCurrentUser() used to query
 * fleet_business_members / fleet_member_portal_grants directly from the browser
 * via createFleetClient() (Fleet DB, anon key, RLS). That RLS relies on
 * auth.uid(), but the caller's session is issued by the separate Core_Eco
 * Supabase project (see auth-adapter.ts's two-layer identity doc) — so
 * auth.uid() inside Fleet Postgres is always null for that call path, and RLS
 * silently returned zero rows regardless of real grants. This route uses the
 * already-proven requireFleetAuth() (Core_Eco session + Fleet service-role
 * lookup) that every other /api/fleet/* route relies on, and getCurrentUser()
 * now fetches through here instead of querying Fleet DB itself.
 */

import { NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { fleetServiceClient } from '@/lib/fleet-service-client'
import { getEffectiveOpsProfileForDriver } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ user: null })

  const [{ data: business }, { data: profile }] = await Promise.all([
    fleetServiceClient.from('businesses').select('slug, type, ops_profile').eq('id', auth.businessId).maybeSingle(),
    fleetServiceClient.from('profiles').select('preferred_language').eq('id', auth.userId).maybeSingle(),
  ])

  /** 'otr' | 'dump_truck' — drives nav filtering, see userMode.ts. Defaults
   *  to 'otr' for businesses created before this column existed. */
  const opsProfile: 'otr' | 'dump_truck' = business?.ops_profile === 'dump_truck' ? 'dump_truck' : 'otr'

  // Per-truck override (2026-08-15): a business can run mixed equipment, so the
  // driver-focus nav resolves from the caller's own most-recent truck instead
  // of always using the flat business default — see getEffectiveOpsProfileForDriver.
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
      role:         auth.role,
      portals:      auth.portals,
      preferredLanguage: profile?.preferred_language === 'es' ? 'es' : 'en',
    },
  })
}
