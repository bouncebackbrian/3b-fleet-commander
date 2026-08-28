import { NextRequest, NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/auth-server-client'
import { fleetServiceClient } from '@/lib/fleet-service-client'
import { ACTIVE_FLEET_BUSINESS_COOKIE } from '@/lib/fleet-auth-guard'

export const dynamic = 'force-dynamic'

/**
 * Core 3Boost/Core_Eco is the source of truth for business identity.
 * This endpoint never creates a Core business. It mirrors an authorized Core
 * business into Fleet Commander using the SAME UUID / 3B Business ID, grants
 * Fleet operational access, and sets that business as the active Fleet context.
 *
 * Safe to retry: all Fleet writes are upserts. A Fleet provisioning failure
 * never deletes or rolls back the Core business.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const businessId = typeof body.businessId === 'string' ? body.businessId : ''
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

    if (membershipError) {
      console.error('[provision-business] Core membership lookup failed:', membershipError)
      return NextResponse.json({ error: 'Could not verify Core business access' }, { status: 500 })
    }
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!['owner', 'manager'].includes(membership.role)) {
      return NextResponse.json({ error: 'Owner or manager access is required to provision Fleet Commander' }, { status: 403 })
    }

    const { data: business, error: businessError } = await core
      .from('businesses')
      .select('id,business_code,legal_name,name,business_type,mc_number,dot_number,address_line1,city,state,zip_code,business_phone,business_email,website_url,quick_text_phone')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      console.error('[provision-business] Core business lookup failed:', businessError)
      return NextResponse.json({ error: 'Core business not found' }, { status: 404 })
    }

    const companyName = business.name || business.legal_name
    const businessType = business.business_type || 'other'

    const { error: mirrorError } = await fleetServiceClient.from('businesses').upsert({
      id: business.id,
      name: companyName,
      company_name: companyName,
      type: businessType,
      business_type: businessType,
      three_b_biz_id: business.business_code,
      active: true,
      owner_id: membership.role === 'owner' ? user.id : null,
      mc_number: business.mc_number,
      dot_number: business.dot_number,
      address_line1: business.address_line1,
      city: business.city,
      state: business.state,
      postal_code: business.zip_code,
      business_phone: business.business_phone,
      domain_email: business.business_email,
      website: business.website_url,
      quick_text_phone: business.quick_text_phone,
    }, { onConflict: 'id' })

    if (mirrorError) {
      console.error('[provision-business] Fleet business mirror failed:', mirrorError)
      return NextResponse.json({ error: 'Could not provision Fleet business record' }, { status: 500 })
    }

    const { error: memberError } = await fleetServiceClient.from('fleet_business_members').upsert({
      business_id: business.id,
      user_id: user.id,
      role: 'admin',
      active: true,
    }, { onConflict: 'business_id,user_id' })

    if (memberError) {
      console.error('[provision-business] Fleet membership failed:', memberError)
      return NextResponse.json({ error: 'Could not provision Fleet membership' }, { status: 500 })
    }

    // Fleet operational authorization is separate from Core ownership.
    const { error: grantError } = await fleetServiceClient.from('fleet_member_portal_grants').upsert({
      business_id: business.id,
      user_id: user.id,
      portal: 'admin',
      permission_level: 'manage',
      granted_by: user.id,
    }, { onConflict: 'business_id,user_id,portal' })

    if (grantError) {
      console.error('[provision-business] Fleet admin grant failed:', grantError)
      return NextResponse.json({ error: 'Could not provision Fleet Admin access' }, { status: 500 })
    }

    const response = NextResponse.json({
      provisioned: true,
      businessId: business.id,
      threeBBusinessId: business.business_code,
    })

    response.cookies.set(ACTIVE_FLEET_BUSINESS_COOKIE, business.id, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })

    return response
  } catch (err) {
    console.error('[provision-business] Unexpected error:', err)
    return NextResponse.json({ error: 'Could not provision Fleet Commander access' }, { status: 500 })
  }
}
