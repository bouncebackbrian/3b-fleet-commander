/**
 * GET  /api/team/members?businessId=xxx  — list members + pending invites
 * PATCH /api/team/members                — update member portal grants
 * DELETE /api/team/members               — remove member or revoke invite
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getApiUser } from '@/lib/api-auth'
import { derivePrimaryRoleLabel, type Portal, type PermissionLevel } from '@/lib/fleet-auth-guard'

async function getCallerMembership(businessId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('fleet_business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle()
  return data
}

// ── GET — list members + invites ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const businessId = req.nextUrl.searchParams.get('businessId')
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })

  const caller = await getCallerMembership(businessId, user.id)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Active members
  const { data: members } = await supabaseAdmin
    .from('fleet_business_members')
    .select('id, user_id, role, active, created_at')
    .eq('business_id', businessId)
    .eq('active', true)
    .order('created_at')

  // Pending invites (owner/admin only)
  let invites: unknown[] = []
  if (['owner', 'admin'].includes(caller.role)) {
    const { data } = await supabaseAdmin
      .from('fleet_team_invites')
      .select('id, email, role, status, expires_at, created_at')
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    invites = data ?? []
  }

  // Portal grants for every active member (drives the grant editor in TeamTab)
  const { data: grantRows } = await supabaseAdmin
    .from('fleet_member_portal_grants')
    .select('user_id, portal, permission_level')
    .eq('business_id', businessId)
  const grantsByUser = new Map<string, { portal: string; permissionLevel: string }[]>()
  for (const g of grantRows ?? []) {
    const list = grantsByUser.get(g.user_id) ?? []
    list.push({ portal: g.portal, permissionLevel: g.permission_level })
    grantsByUser.set(g.user_id, list)
  }

  // Resolve user emails for members (best-effort via auth admin)
  const memberList = await Promise.all(
    (members ?? []).map(async m => {
      try {
        const { data: { user: u } } = await supabaseAdmin.auth.admin.getUserById(m.user_id)
        return { ...m, email: u?.email ?? null, isSelf: m.user_id === user.id, portalGrants: grantsByUser.get(m.user_id) ?? [] }
      } catch {
        return { ...m, email: null, isSelf: m.user_id === user.id, portalGrants: grantsByUser.get(m.user_id) ?? [] }
      }
    })
  )

  return NextResponse.json({ members: memberList, invites, callerRole: caller.role })
}

// ── PATCH — update portal grants ────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { businessId, memberId, portalGrants } = await req.json() as {
    businessId?: string; memberId?: string; portalGrants?: { portal: Portal; permissionLevel: PermissionLevel }[]
  }
  if (!businessId || !memberId || !portalGrants) {
    return NextResponse.json({ error: 'businessId, memberId, and portalGrants are required' }, { status: 400 })
  }
  const caller = await getCallerMembership(businessId, user.id)
  if (!caller || !['owner', 'admin'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: member } = await supabaseAdmin
    .from('fleet_business_members')
    .select('user_id')
    .eq('id', memberId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  // Replace this member's grants entirely with the submitted set.
  const { error: deleteError } = await supabaseAdmin
    .from('fleet_member_portal_grants')
    .delete()
    .eq('business_id', businessId)
    .eq('user_id', member.user_id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  if (portalGrants.length) {
    const { error: insertError } = await supabaseAdmin
      .from('fleet_member_portal_grants')
      .insert(portalGrants.map(g => ({
        business_id: businessId, user_id: member.user_id,
        portal: g.portal, permission_level: g.permissionLevel, granted_by: user.id,
      })))
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Keep the legacy role column as a best-effort display label.
  await supabaseAdmin
    .from('fleet_business_members')
    .update({ role: derivePrimaryRoleLabel(portalGrants) })
    .eq('id', memberId)
    .eq('business_id', businessId)

  return NextResponse.json({ success: true })
}

// ── DELETE — remove member or revoke invite ───────────────────────────────────

export async function DELETE(req: NextRequest) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { businessId, memberId, inviteId } = await req.json()
  const caller = await getCallerMembership(businessId, user.id)
  if (!caller || !['owner', 'admin'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (memberId) {
    await supabaseAdmin
      .from('fleet_business_members')
      .update({ active: false })
      .eq('id', memberId)
      .eq('business_id', businessId)
  }

  if (inviteId) {
    await supabaseAdmin
      .from('fleet_team_invites')
      .update({ status: 'revoked' })
      .eq('id', inviteId)
      .eq('business_id', businessId)
  }

  return NextResponse.json({ success: true })
}
