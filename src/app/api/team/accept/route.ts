/**
 * POST /api/team/accept
 * Accept a team invite. Authenticated user only.
 *
 * Body: { token }
 *
 * Validates invite, creates fleet_business_members row, marks invite accepted.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getApiUser } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  // Load and validate invite
  const { data: invite } = await supabaseAdmin
    .from('fleet_team_invites')
    .select('id, business_id, role, status, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!invite)                                      return NextResponse.json({ error: 'Invite not found' },     { status: 404 })
  if (invite.status !== 'pending')                  return NextResponse.json({ error: 'Invite already used' },  { status: 409 })
  if (new Date(invite.expires_at) < new Date())     return NextResponse.json({ error: 'Invite expired' },       { status: 410 })

  // Check not already a member
  const { data: existing } = await supabaseAdmin
    .from('fleet_business_members')
    .select('id, active')
    .eq('business_id', invite.business_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing?.active) {
    return NextResponse.json({ error: 'Already a member of this business' }, { status: 409 })
  }

  // Add to fleet_business_members (upsert in case they had a revoked record)
  const { error: memberError } = await supabaseAdmin
    .from('fleet_business_members')
    .upsert({
      business_id: invite.business_id,
      user_id:     user.id,
      role:        invite.role,
      active:      true,
    }, { onConflict: 'business_id,user_id' })

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  // Mark invite accepted
  await supabaseAdmin
    .from('fleet_team_invites')
    .update({
      status:      'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
    })
    .eq('id', invite.id)

  return NextResponse.json({ success: true, businessId: invite.business_id, role: invite.role })
}
