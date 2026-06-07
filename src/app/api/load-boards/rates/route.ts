/**
 * GET /api/load-boards/rates
 *
 * Get market rate intelligence for a lane from a specific board.
 *
 * Query params:
 *   businessId   string
 *   board        LoadBoardId
 *   origin       state code (e.g. TX)
 *   dest         state code (e.g. CA)
 *   equipment    EquipmentType (e.g. V, R, F)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getMarketRates } from '@/lib/loadBoardConnector'
import { getApiUser } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { LoadBoardId, EquipmentType } from '@/lib/loadBoards/types'

export async function GET(req: NextRequest) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const businessId = searchParams.get('businessId')
  const board      = searchParams.get('board') as LoadBoardId
  const origin     = searchParams.get('origin')
  const dest       = searchParams.get('dest')
  const equipment  = (searchParams.get('equipment') ?? 'V') as EquipmentType

  if (!businessId || !board || !origin || !dest) {
    return NextResponse.json({ error: 'businessId, board, origin, dest required' }, { status: 400 })
  }

  const { data: membership } = await supabaseAdmin
    .from('fleet_business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rate = await getMarketRates({ businessId, board, originState: origin, destState: dest, equipment })
  if (!rate) return NextResponse.json({ error: 'Rate data unavailable for this lane/board' }, { status: 404 })

  return NextResponse.json(rate)
}
