/**
 * POST /api/load-boards/post
 *
 * Post an available truck to one or more load boards simultaneously.
 *
 * Body:
 *   businessId  string
 *   boards      LoadBoardId[]
 *   truck       TruckPosting
 */

import { NextRequest, NextResponse } from 'next/server'
import { postTruck } from '@/lib/loadBoardConnector'
import { getApiUser } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { LoadBoardId, TruckPosting } from '@/lib/loadBoards/types'

export async function POST(req: NextRequest) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { businessId: string; boards: LoadBoardId[]; truck: TruckPosting }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { data: membership } = await supabaseAdmin
    .from('fleet_business_members')
    .select('role')
    .eq('business_id', body.businessId)
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle()

  if (!membership || !['owner','dispatcher','admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const results = await postTruck({ businessId: body.businessId, boards: body.boards, truck: body.truck })
  return NextResponse.json({ results, postedAt: new Date().toISOString() })
}
