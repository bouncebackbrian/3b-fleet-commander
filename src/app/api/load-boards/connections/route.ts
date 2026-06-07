/**
 * GET /api/load-boards/connections?businessId=xxx
 * List connected boards for a business — returns status WITHOUT credentials.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const businessId = req.nextUrl.searchParams.get('businessId')
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })

  const { data: membership } = await supabaseAdmin
    .from('fleet_business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await supabaseAdmin
    .from('fleet_load_board_connections')
    .select('board, display_name, auth_type, enabled, last_synced_at, last_error')
    .eq('business_id', businessId)

  return NextResponse.json({ connections: data ?? [] })
}
