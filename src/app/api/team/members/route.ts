/**
 * GET  /api/team/members?businessId=xxx  — list members + pending invites
 * PATCH /api/team/members                — update member role
 * DELETE /api/team/members               — remove member or revoke invite
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getCallerMembership(supabase: ReturnType<typeof createServerClient>, businessId: string, userId: string) {
  const { data } = await supabase
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
  const cookieStore = await cookies()
  const supabase    = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const businessId = req.nextUrl.searchParams.get('businessId')
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })

  const caller = await getCallerMembership(supabase, businessId, user.id)
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

  // Resolve user emails for members (best-effort via auth admin)
  const memberList = await Promise.all(
    (members ?? []).map(async m => {
      try {
        const { data: { user: u } } = await supabaseAdmin.auth.admin.getUserById(m.user_id)
        return { ...m, email: u?.email ?? null, isSelf: m.user_id === user.id }
      } catch {
        return { ...m, email: null, isSelf: m.user_id === user.id }
      }
    })
  )

  return NextResponse.json({ members: memberList, invites, callerRole: caller.role })
}

// ── PATCH — update role ───────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase    = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { businessId, memberId, role } = await req.json()
  const caller = await getCallerMembership(supabase, businessId, user.id)
  if (!caller || !['owner', 'admin'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('fleet_business_members')
    .update({ role })
    .eq('id', memberId)
    .eq('business_id', businessId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// ── DELETE — remove member or revoke invite ───────────────────────────────────

export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase    = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { businessId, memberId, inviteId } = await req.json()
  const caller = await getCallerMembership(supabase, businessId, user.id)
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
