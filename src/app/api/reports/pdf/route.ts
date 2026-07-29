/**
 * POST /api/reports/pdf — generic branded PDF renderer
 *
 * For pages that already have their row data client-side (audit settlement
 * log, expenses) rather than building it server-side from a dump-truck
 * export route — same branded engine (src/lib/reports/pdf.tsx), just fed
 * over the wire instead of assembled in-process. Any authenticated business
 * member may render a PDF of data they're already looking at; this route
 * does not read or validate the row contents itself.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { getBusinessMeta } from '@/lib/fleet/dumpTruck/shared'
import { renderReportTablePdf } from '@/lib/reports/pdf'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const { title, metaLine, disclaimers, columns, rows } = body
    if (!title || !Array.isArray(columns) || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'title, columns, and rows are required' }, { status: 400 })
    }

    const meta = await getBusinessMeta(auth.businessId)
    const pdf = await renderReportTablePdf(auth.businessId, meta.businessName, meta.threebBizId, {
      title, metaLine: metaLine ?? '', disclaimers: disclaimers ?? [], headers: columns, body: rows,
    })

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${String(title).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[api/reports/pdf] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
