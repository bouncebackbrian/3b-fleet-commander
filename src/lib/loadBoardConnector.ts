/**
 * loadBoardConnector.ts — Fleet Commander Load Board Aggregator
 *
 * Single entry point for all load board operations across DAT, Truckstop, and others.
 *
 * Architecture:
 *   Browser → FC API routes (server-side, credential-safe)
 *   FC API routes → loadBoardConnector → board-specific adapter
 *   Credentials stored in fleet_load_board_connections (Supabase, RLS-protected)
 *   Results cached in fleet_load_board_cache (10-minute TTL)
 *
 * NEVER import this file in client components.
 * Client components call /api/load-boards/* routes instead.
 */

import { createClient } from '@supabase/supabase-js'
import { datAdapter }       from './loadBoards/datAdapter'
import { truckstopAdapter } from './loadBoards/truckstopAdapter'
import type {
  LoadBoardId, LoadBoardAdapter, LoadBoardCredentials,
  LoadSearchParams, NormalizedLoad, TruckPosting,
  MarketRate, EquipmentType, LoadBoardSearchResult,
} from './loadBoards/types'

// ── Registry of adapters ──────────────────────────────────────────────────────

const ADAPTERS: Partial<Record<LoadBoardId, LoadBoardAdapter>> = {
  dat:       datAdapter,
  truckstop: truckstopAdapter,
  // 123loadboard, loadsmart, uber_freight — added as adapters are built
}

// ── Supabase admin client (server-side only) ──────────────────────────────────

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,   // never exposed to browser
  )
}

// ── Credential resolution ─────────────────────────────────────────────────────

export async function getCredentials(
  businessId: string,
  board:       LoadBoardId,
): Promise<LoadBoardCredentials | null> {
  try {
    const supabase = getAdminClient()
    const { data } = await supabase
      .from('fleet_load_board_connections')
      .select('*')
      .eq('business_id', businessId)
      .eq('board', board)
      .eq('enabled', true)
      .maybeSingle()

    if (!data) return null

    return {
      boardId:      board,
      authType:     data.auth_type,
      clientId:     data.client_id,
      clientSecret: data.client_secret,
      apiKey:       data.api_key,
      username:     data.username,
      password:     data.password,
      baseUrl:      data.base_url,
      accessToken:  data.access_token,
      tokenExpires: data.token_expires_at,
    }
  } catch { return null }
}

export async function getEnabledBoards(businessId: string): Promise<LoadBoardId[]> {
  try {
    const supabase = getAdminClient()
    const { data } = await supabase
      .from('fleet_load_board_connections')
      .select('board')
      .eq('business_id', businessId)
      .eq('enabled', true)

    return (data ?? []).map(r => r.board as LoadBoardId)
  } catch { return [] }
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

function hashParams(params: LoadSearchParams): string {
  return Buffer.from(JSON.stringify(params)).toString('base64').slice(0, 32)
}

async function getCached(
  businessId:  string,
  board:       LoadBoardId,
  searchHash:  string,
): Promise<NormalizedLoad[] | null> {
  try {
    const supabase = getAdminClient()
    const { data } = await supabase
      .from('fleet_load_board_cache')
      .select('results')
      .eq('business_id', businessId)
      .eq('board', board)
      .eq('search_hash', searchHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    return data ? (data.results as NormalizedLoad[]) : null
  } catch { return null }
}

async function setCache(
  businessId:  string,
  board:       LoadBoardId,
  searchHash:  string,
  results:     NormalizedLoad[],
): Promise<void> {
  try {
    const supabase  = getAdminClient()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()  // 10 min
    await supabase
      .from('fleet_load_board_cache')
      .upsert(
        { business_id: businessId, board, search_hash: searchHash, results, expires_at: expiresAt },
        { onConflict: 'business_id,board,search_hash' }
      )
  } catch { /* cache miss is ok */ }
}

// ── Core search ───────────────────────────────────────────────────────────────

/**
 * searchLoads — search one or all enabled boards for a business.
 * Results are cached for 10 minutes to avoid hammering APIs.
 *
 * @param businessId  The carrier/broker business
 * @param params      Search criteria
 * @param boards      Which boards to search (default: all enabled)
 */
export async function searchLoads(
  businessId: string,
  params:     LoadSearchParams,
  boards?:    LoadBoardId[],
): Promise<LoadBoardSearchResult[]> {
  const enabledBoards = boards ?? await getEnabledBoards(businessId)
  if (enabledBoards.length === 0) return []

  const searchHash = hashParams(params)

  const results = await Promise.allSettled(
    enabledBoards.map(async (board): Promise<LoadBoardSearchResult> => {
      const adapter = ADAPTERS[board]
      if (!adapter) return { board, loads: [], total: 0, fetchedAt: new Date().toISOString(), error: 'Adapter not available' }

      // Try cache first
      const cached = await getCached(businessId, board, searchHash)
      if (cached) return { board, loads: cached, total: cached.length, fetchedAt: new Date().toISOString() }

      const creds = await getCredentials(businessId, board)
      if (!creds) return { board, loads: [], total: 0, fetchedAt: new Date().toISOString(), error: 'No credentials configured' }

      const loads = await adapter.searchLoads(params, creds)
      await setCache(businessId, board, searchHash, loads)

      // Update last_synced_at
      getAdminClient()
        .from('fleet_load_board_connections')
        .update({ last_synced_at: new Date().toISOString(), last_error: null })
        .eq('business_id', businessId)
        .eq('board', board)
        .then(() => {})

      return { board, loads, total: loads.length, fetchedAt: new Date().toISOString() }
    })
  )

  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<LoadBoardSearchResult>).value)
}

// ── Book a load ───────────────────────────────────────────────────────────────

/**
 * bookLoad — accept a load through the board's API, then create a fleet_loads record.
 * This is the hook that converts a board lead into a tracked Fleet Commander load.
 */
export async function bookLoad(opts: {
  businessId:  string
  board:       LoadBoardId
  boardLoadId: string
  load:        NormalizedLoad      // pass the already-fetched normalized load
  dispatcherId: string
}): Promise<{ success: boolean; fleetLoadId?: string; error?: string }> {
  const { businessId, board, boardLoadId, load, dispatcherId } = opts

  const adapter = ADAPTERS[board]
  if (!adapter) return { success: false, error: 'Adapter not available' }

  const creds = await getCredentials(businessId, board)
  if (!creds) return { success: false, error: 'No credentials configured' }

  // 1. Book on the board (if supported)
  let boardConfirmationId: string | undefined
  if (adapter.bookLoad) {
    const result = await adapter.bookLoad(boardLoadId, creds)
    if (!result.success) return result
    boardConfirmationId = result.confirmationId
  }

  // 2. Create fleet_loads record
  try {
    const supabase = getAdminClient()
    const loadNumber = `FC-${Date.now().toString(36).toUpperCase()}`

    const { data: fleetLoad } = await supabase
      .from('fleet_loads')
      .insert({
        business_id:       businessId,
        load_number:       loadNumber,
        origin:            `${load.origin.city}, ${load.origin.state}`,
        destination:       `${load.destination.city}, ${load.destination.state}`,
        dispatch_miles:    load.tripMiles ?? 0,
        gross_rate:        load.rate ?? 0,
        status:            'booked',
        source_board:      board,
        source_load_id:    boardLoadId,
        board_confirm_id:  boardConfirmationId ?? null,
        dispatcher_id:     dispatcherId,
        load_date:         load.origin.earlyDate ?? new Date().toISOString().split('T')[0],
      })
      .select('id')
      .single()

    if (!fleetLoad) return { success: false, error: 'Failed to create fleet load record' }

    // 3. Save rate confirmation if rate is known
    if (load.rate) {
      await supabase.from('fleet_rate_confirmations').insert({
        load_id:     fleetLoad.id,
        business_id: businessId,
        gross_rate:  load.rate,
        confirmed_at: new Date().toISOString(),
        confirmed_by: dispatcherId,
      })
    }

    return { success: true, fleetLoadId: fleetLoad.id }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Database error' }
  }
}

// ── Post a truck ──────────────────────────────────────────────────────────────

export async function postTruck(opts: {
  businessId: string
  boards:     LoadBoardId[]
  truck:      TruckPosting
}): Promise<Record<LoadBoardId, { success: boolean; postingId?: string; error?: string }>> {
  const results: Record<string, { success: boolean; postingId?: string; error?: string }> = {}

  await Promise.allSettled(
    opts.boards.map(async board => {
      const adapter = ADAPTERS[board]
      if (!adapter?.postTruck) { results[board] = { success: false, error: 'Not supported' }; return }

      const creds = await getCredentials(opts.businessId, board)
      if (!creds) { results[board] = { success: false, error: 'No credentials' }; return }

      results[board] = await adapter.postTruck(opts.truck, creds)
    })
  )

  return results
}

// ── Market rates ──────────────────────────────────────────────────────────────

export async function getMarketRates(opts: {
  businessId:  string
  board:       LoadBoardId
  originState: string
  destState:   string
  equipment:   EquipmentType
}): Promise<MarketRate | null> {
  const adapter = ADAPTERS[opts.board]
  if (!adapter?.getMarketRates) return null

  const creds = await getCredentials(opts.businessId, opts.board)
  if (!creds) return null

  return adapter.getMarketRates(opts.originState, opts.destState, opts.equipment, creds)
}

// ── Save connection ───────────────────────────────────────────────────────────

export async function saveConnection(opts: {
  businessId:   string
  board:        LoadBoardId
  authType:     LoadBoardCredentials['authType']
  clientId?:    string
  clientSecret?: string
  apiKey?:      string
  username?:    string
  password?:    string
  baseUrl?:     string
  displayName?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getAdminClient()
    await supabase
      .from('fleet_load_board_connections')
      .upsert({
        business_id:  opts.businessId,
        board:        opts.board,
        display_name: opts.displayName ?? null,
        auth_type:    opts.authType,
        client_id:    opts.clientId    ?? null,
        client_secret: opts.clientSecret ?? null,
        api_key:      opts.apiKey      ?? null,
        username:     opts.username    ?? null,
        password:     opts.password    ?? null,
        base_url:     opts.baseUrl     ?? null,
        enabled:      true,
        updated_at:   new Date().toISOString(),
      }, { onConflict: 'business_id,board' })

    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Save failed' }
  }
}
