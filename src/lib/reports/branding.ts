/**
 * reports/branding.ts — shared branded report header (2026-07-29)
 *
 * Generalizes the `# ...` comment-block header that every CSV export in
 * src/lib/fleet/dumpTruck/exports.ts already built ad hoc, now carrying the
 * business's real name + 3B Business ID. A CSV is plain text — it cannot
 * contain an embedded logo image, so this is the whole of "branding" on
 * CSV. The logo itself only appears in the PDF option (see reports/pdf.tsx),
 * which every report gains alongside its CSV.
 */

export interface ReportHeaderInfo {
  businessName: string
  threeBBizId: string | null
  title: string
  generatedAt: string
  rangeLabel: string
  disclaimers?: string[]
}

/** CSV header block — same shape every buildXCsv() in exports.ts used inline before. */
export function buildReportHeaderLines(info: ReportHeaderInfo): string {
  const lines = [
    `# ${info.businessName} — via 3B Fleet Commander`,
    `# ${info.title}`,
    `# 3B Business ID: ${info.threeBBizId ?? 'N/A'}`,
    `# Generated: ${info.generatedAt}  ${info.rangeLabel}`,
    ...(info.disclaimers ?? []).map(d => `# ${d}`),
  ]
  return lines.join('\r\n') + '\r\n\r\n'
}
