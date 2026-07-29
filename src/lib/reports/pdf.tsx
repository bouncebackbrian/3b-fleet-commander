/**
 * reports/pdf.tsx — generic branded PDF report engine (2026-07-29)
 *
 * One document renderer reused by every report — the same {columns, rows}
 * shape each CSV builder already produces drives the PDF table too, so
 * there's no duplicate per-report layout code. Landscape + small type: some
 * of these tables (e.g. the driver hours detail export) run ~40 columns,
 * too wide for a readable portrait page — this is a real tradeoff, not a
 * bug, and matches the CSV's full column set rather than silently dropping
 * data to make the PDF prettier.
 */

import { Document, Page, Text, View, Image, StyleSheet, renderToStream } from '@react-pdf/renderer'
import { getBusinessLogoForPdf } from '@/lib/fleet/business'

export interface ReportPdfInput {
  logoBytes?: Buffer | null
  logoFormat?: 'png' | 'jpg'
  businessName: string
  threeBBizId: string | null
  title: string
  metaLines: string[]
  disclaimers?: string[]
  columns: string[]
  rows: (string | number)[][]
}

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 7, fontFamily: 'Helvetica' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  logo: { width: 40, height: 40, objectFit: 'contain' },
  businessName: { fontSize: 14, fontWeight: 700 },
  tagline: { fontSize: 8, color: '#666' },
  title: { fontSize: 11, fontWeight: 700, marginTop: 10, marginBottom: 2 },
  metaLine: { fontSize: 8, color: '#444' },
  disclaimer: { fontSize: 7, color: '#888', marginTop: 2 },
  table: { marginTop: 10, borderTop: '1px solid #ccc', borderLeft: '1px solid #ccc' },
  tableRow: { flexDirection: 'row' },
  tableHeaderCell: { flexGrow: 1, flexBasis: 0, padding: 3, borderRight: '1px solid #ccc', borderBottom: '1px solid #ccc', fontWeight: 700, backgroundColor: '#f2f2f2' },
  tableCell: { flexGrow: 1, flexBasis: 0, padding: 3, borderRight: '1px solid #ccc', borderBottom: '1px solid #ccc' },
  footer: { position: 'absolute', bottom: 16, left: 24, right: 24, fontSize: 7, color: '#999', textAlign: 'center' },
})

function ReportDocument(props: ReportPdfInput) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.headerRow}>
          {props.logoBytes && (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <Image style={styles.logo} src={{ data: props.logoBytes, format: props.logoFormat ?? 'png' } as any} />
          )}
          <View>
            <Text style={styles.businessName}>{props.businessName}</Text>
            <Text style={styles.tagline}>via 3B Fleet Commander{props.threeBBizId ? ` — 3B Business ID: ${props.threeBBizId}` : ''}</Text>
          </View>
        </View>

        <Text style={styles.title}>{props.title}</Text>
        {props.metaLines.map((line, i) => <Text key={i} style={styles.metaLine}>{line}</Text>)}
        {(props.disclaimers ?? []).map((line, i) => <Text key={i} style={styles.disclaimer}>{line}</Text>)}

        <View style={styles.table}>
          <View style={styles.tableRow} fixed>
            {props.columns.map((c, i) => <Text key={i} style={styles.tableHeaderCell}>{c}</Text>)}
          </View>
          {props.rows.map((row, r) => (
            <View key={r} style={styles.tableRow} wrap={false}>
              {row.map((cell, c) => <Text key={c} style={styles.tableCell}>{cell === null || cell === undefined ? '' : String(cell)}</Text>)}
            </View>
          ))}
        </View>

        <Text style={styles.footer} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages} — Generated via 3B Fleet Commander`} fixed />
      </Page>
    </Document>
  )
}

export async function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  const stream = await renderToStream(<ReportDocument {...input} />)
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export interface ReportTableForPdf {
  title: string
  metaLine: string
  disclaimers: string[]
  headers: string[]
  body: (string | number)[][]
}

/** Convenience wrapper: fetches the business logo and renders in one call — every export route uses this. */
export async function renderReportTablePdf(
  businessId: string, businessName: string, threeBBizId: string | null, table: ReportTableForPdf,
): Promise<Buffer> {
  const logo = await getBusinessLogoForPdf(businessId)
  return renderReportPdf({
    logoBytes: logo?.bytes ?? null,
    logoFormat: logo?.format,
    businessName, threeBBizId,
    title: table.title,
    metaLines: [table.metaLine],
    disclaimers: table.disclaimers,
    columns: table.headers,
    rows: table.body,
  })
}
