'use client'
/**
 * reports/clientExport.ts — branded CSV/PDF export for client-only pages
 * (audit settlement log, expenses) that already have their row data loaded
 * in browser state rather than assembled server-side. CSV header reuses
 * the same buildReportHeaderLines() every dump-truck export uses (pure
 * string building, safe in the browser); PDF is rendered server-side via
 * POST /api/reports/pdf so the business logo (private storage) never has
 * to reach the browser.
 */

import { buildReportHeaderLines } from './branding'

let cachedBusiness: { businessName: string; threeBBizId: string | null } | null = null

async function getBusinessBranding(): Promise<{ businessName: string; threeBBizId: string | null }> {
  if (cachedBusiness) return cachedBusiness
  try {
    const res = await fetch('/api/fleet/business/profile')
    const body = await res.json()
    cachedBusiness = { businessName: body.profile?.name ?? 'Business', threeBBizId: body.profile?.threeBBizId ?? null }
  } catch {
    cachedBusiness = { businessName: 'Business', threeBBizId: null }
  }
  return cachedBusiness
}

export interface ExportTable {
  title: string
  rangeLabel: string
  disclaimers?: string[]
  columns: string[]
  rows: (string | number)[][]
}

function escapeCsvField(value: string | number): string {
  const str = String(value)
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadBrandedCsv(table: ExportTable, filenameBase: string): Promise<void> {
  const { businessName, threeBBizId } = await getBusinessBranding()
  const header = buildReportHeaderLines({
    businessName, threeBBizId, title: table.title,
    generatedAt: new Date().toISOString(), rangeLabel: table.rangeLabel, disclaimers: table.disclaimers,
  })
  const headerLine = table.columns.map(escapeCsvField).join(',')
  const bodyLines = table.rows.map(row => row.map(escapeCsvField).join(','))
  const csv = header + [headerLine, ...bodyLines].join('\r\n') + '\r\n'
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${filenameBase}.csv`)
}

export async function downloadBrandedPdf(table: ExportTable, filenameBase: string): Promise<void> {
  const res = await fetch('/api/reports/pdf', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: table.title, metaLine: table.rangeLabel, disclaimers: table.disclaimers ?? [],
      columns: table.columns, rows: table.rows,
    }),
  })
  if (!res.ok) throw new Error('Could not generate PDF')
  triggerDownload(await res.blob(), `${filenameBase}.pdf`)
}
