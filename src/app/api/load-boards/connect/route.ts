/**
 * POST /api/load-boards/connect
 * Save load board credentials for a business (owner/admin only).
 * Credentials stored server-side via SUPABASE_SERVICE_ROLE_KEY.
 */

import { NextRequest, NextResponse } from 'next/server'
import { saveConnection } from '@/lib/loadBoardConnector'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { LoadBoardId } from '@/lib/loadBoards/types'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { businessId, board, authType, clientId, clientSecret, apiKey, username, password, displayName } = body

  if (!businessId || !board) {
    return NextResponse.json({ error: 'businessId and board required' }, { status: 400 })
  }

  // Only owners/admins can manage connections
  const { data: membership } = await supabase
    .from('fleet_business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden — owner or admin required' }, { status: 403 })
  }

  const result = await saveConnection({
    businessId, board: board as LoadBoardId, authType,
    clientId, clientSecret, apiKey, username, password, displayName,
  })

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
