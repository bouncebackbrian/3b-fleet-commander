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

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ user: null })

  const { data: business } = await fleetServiceClient
    .from('businesses')
    .select('slug, type, ops_profile')
    .eq('id', auth.businessId)
    .maybeSingle()

  return NextResponse.json({
    user: {
      id:           auth.userId,
      email:        auth.email,
      businessId:   auth.businessId,
      businessSlug: business?.slug ?? null,
      businessType: business?.type ?? null,
      /** 'otr' | 'dump_truck' — drives nav filtering, see userMode.ts. Defaults
       *  to 'otr' for businesses created before this column existed. */
      opsProfile:   business?.ops_profile ?? 'otr',
      role:         auth.role,
      portals:      auth.portals,
    },
  })
}
