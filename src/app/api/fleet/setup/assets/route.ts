import { NextRequest, NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/auth-server-client'
import { fleetServiceClient } from '@/lib/fleet-service-client'

export const dynamic = 'force-dynamic'

/** Setup-only asset read.
 * Core verifies the user belongs to the requested business; Fleet DB supplies
 * the operational asset rows for that same permanent business UUID.
 */
export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get('businessId') ?? ''
    if (!businessId) return NextResponse.json({ error: 'businessId is required' }, { status: 400 })

    const core = await createAuthServerClient()
    const { data: { user }, error: authError } = await core.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: membership, error: membershipError } = await core
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError) return NextResponse.json({ error: 'Could not verify business access' }, { status: 500 })
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await fleetServiceClient
      .from('fleet_equipment')
      .select('id,unit_number,equipment_type,make,model,year,status,vin,license_plate')
      .eq('business_id', businessId)
      .order('unit_number', { ascending: true })

    if (error) {
      console.error('[fleet/setup/assets] Fleet query failed:', error)
      return NextResponse.json({ error: 'Could not load company assets' }, { status: 500 })
    }

    return NextResponse.json({ assets: data ?? [] })
  } catch (err) {
    console.error('[fleet/setup/assets] Unexpected error:', err)
    return NextResponse.json({ error: 'Could not load company assets' }, { status: 500 })
  }
}
