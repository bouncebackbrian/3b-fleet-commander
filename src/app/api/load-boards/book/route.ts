/**
 * POST /api/load-boards/book
 *
 * Book a load from a board, create a fleet_loads record,
 * save the rate confirmation, and trigger platform fee calculation.
 *
 * Body:
 *   businessId   string
 *   board        LoadBoardId
 *   boardLoadId  string
 *   load         NormalizedLoad   (pass the full load object)
 */

import { NextRequest, NextResponse } from 'next/server'
import { bookLoad } from '@/lib/loadBoardConnector'
import { onLoadClose } from '@/lib/billingEngine'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { LoadBoardId, NormalizedLoad } from '@/lib/loadBoards/types'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { businessId: string; board: LoadBoardId; boardLoadId: string; load: NormalizedLoad }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.businessId || !body.board || !body.boardLoadId || !body.load) {
    return NextResponse.json({ error: 'businessId, board, boardLoadId, load required' }, { status: 400 })
  }

  // Verify dispatcher/owner role
  const { data: membership } = await supabase
    .from('fleet_business_members')
    .select('role')
    .eq('business_id', body.businessId)
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle()

  if (!membership || !['owner','dispatcher','admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden — dispatcher role required' }, { status: 403 })
  }

  const result = await bookLoad({
    businessId:   body.businessId,
    board:        body.board,
    boardLoadId:  body.boardLoadId,
    load:         body.load,
    dispatcherId: user.id,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  // If rate is known and there's a broker_business_id, auto-calculate platform fee
  if (result.fleetLoadId && body.load.rate) {
    onLoadClose({
      loadId:     result.fleetLoadId,
      businessId: body.businessId,
    }).catch(() => {})
  }

  return NextResponse.json({
    success:     true,
    fleetLoadId: result.fleetLoadId,
    loadNumber:  result.fleetLoadId,
    bookedAt:    new Date().toISOString(),
  })
}
