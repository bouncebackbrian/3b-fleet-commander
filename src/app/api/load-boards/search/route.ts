/**
 * POST /api/load-boards/search
 *
 * Server-side proxy for load board search.
 * Reads credentials from Supabase (never exposed to browser).
 * Returns normalized loads from one or all enabled boards.
 *
 * Body:
 *   businessId   string
 *   boards?      LoadBoardId[]   (default: all enabled for this business)
 *   params       LoadSearchParams
 */

import { NextRequest, NextResponse } from 'next/server'
import { searchLoads } from '@/lib/loadBoardConnector'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { LoadSearchParams, LoadBoardId } from '@/lib/loadBoards/types'

export async function POST(req: NextRequest) {
  // Verify auth
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { businessId: string; boards?: LoadBoardId[]; params: LoadSearchParams }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.businessId || !body.params?.equipment) {
    return NextResponse.json({ error: 'businessId and params.equipment required' }, { status: 400 })
  }

  // Verify the user belongs to this business
  const { data: membership } = await supabase
    .from('fleet_business_members')
    .select('role')
    .eq('business_id', body.businessId)
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const results = await searchLoads(body.businessId, body.params, body.boards)
  return NextResponse.json({ results, searchedAt: new Date().toISOString() })
}
