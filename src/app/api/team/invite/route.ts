/**
 * POST /api/team/invite
 * Send a team invite for a business. Owner/admin only.
 *
 * Body: { businessId, email, role }
 * Returns: { inviteId, token, inviteUrl }
 *
 * In production, send the inviteUrl by email via NEXT_PUBLIC_EMAIL_ENDPOINT.
 * In dev/no-email-config, return the URL directly so you can share it manually.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getApiUser } from '@/lib/api-auth'
import type { MemberRole } from '@/lib/auth-adapter'

export async function POST(req: NextRequest) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { businessId, email, role } = await req.json()
  if (!businessId || !email || !role) {
    return NextResponse.json({ error: 'businessId, email, and role required' }, { status: 400 })
  }

  // Verify caller is owner or admin
  const { data: membership } = await supabaseAdmin
    .from('fleet_business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden — owner or admin required' }, { status: 403 })
  }

  // Upsert invite (resets token + expiry if re-inviting same email)
  const { data: invite, error } = await supabaseAdmin
    .from('fleet_team_invites')
    .upsert({
      business_id: businessId,
      email:       email.toLowerCase().trim(),
      role:        role as MemberRole,
      invited_by:  user.id,
      status:      'pending',
      expires_at:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'business_id,email' })
    .select('id, token')
    .single()

  if (error || !invite) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create invite' }, { status: 500 })
  }

  const siteUrl   = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const inviteUrl = `${siteUrl}/join/${invite.token}`

  // Attempt email delivery if endpoint configured
  const emailEndpoint = process.env.NEXT_PUBLIC_EMAIL_ENDPOINT
  if (emailEndpoint) {
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('name')
      .eq('id', businessId)
      .single()

    fetch(emailEndpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        to:      email,
        subject: `You've been invited to join ${biz?.name ?? 'a fleet'} on Fleet Commander`,
        text:    `You've been invited as a ${role}.\n\nAccept your invite:\n${inviteUrl}\n\nThis link expires in 7 days.`,
        html:    `<p>You've been invited as a <strong>${role}</strong>.</p><p><a href="${inviteUrl}">Accept Invite →</a></p><p><small>Expires in 7 days.</small></p>`,
      }),
    }).catch(() => { /* fire-and-forget */ })
  }

  return NextResponse.json({ inviteId: invite.id, inviteUrl, emailSent: !!emailEndpoint })
}
