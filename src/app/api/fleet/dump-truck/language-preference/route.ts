/**
 * PATCH /api/fleet/dump-truck/language-preference — set the caller's
 * preferred UI language (spec §6 EN/ES foundation). Any authenticated
 * fleet user may set their own preference.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { setPreferredLanguage, type PreferredLanguage } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

const VALID_LANGUAGES: PreferredLanguage[] = ['en', 'es']

export async function PATCH(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    if (!VALID_LANGUAGES.includes(body.language)) {
      return NextResponse.json({ error: `language must be one of ${VALID_LANGUAGES.join(', ')}` }, { status: 400 })
    }
    await setPreferredLanguage(auth.userId, body.language)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/fleet/dump-truck/language-preference] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
