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

// ── Digital dispatch ticket ─────────────────────────────────────────────────

export interface DispatchTicketSignature {
  imageBytes: Buffer
  signedBy: string
  signedAt: string
}

export interface DispatchTicketTimelineRow {
  time: string
  label: string
  loadTag?: string | null
}

export interface DispatchTicketPdfInput {
  logoBytes?: Buffer | null
  logoFormat?: 'png' | 'jpg'
  businessName: string
  threeBBizId: string | null
  jobNumber: string
  brokerName: string | null
  driverName: string
  truckUnit: string | null
  date: string
  fields: { label: string; value: string }[]
  timeline: DispatchTicketTimelineRow[]
  companySignature: DispatchTicketSignature | null
  driverSignature: DispatchTicketSignature | null
}

const ticketStyles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: 'Helvetica' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  logo: { width: 44, height: 44, objectFit: 'contain' },
  businessName: { fontSize: 15, fontWeight: 700 },
  tagline: { fontSize: 8, color: '#666' },
  title: { fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 8 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  field: { width: '45%' },
  fieldLabel: { fontSize: 7, color: '#666', textTransform: 'uppercase' },
  fieldValue: { fontSize: 9, fontWeight: 700 },
  sectionTitle: { fontSize: 9, fontWeight: 700, marginTop: 8, marginBottom: 4, textTransform: 'uppercase', color: '#444' },
  table: { borderTop: '1px solid #ccc', borderLeft: '1px solid #ccc', marginBottom: 14 },
  tableRow: { flexDirection: 'row' },
  tableHeaderCell: { flexGrow: 1, flexBasis: 0, padding: 3, borderRight: '1px solid #ccc', borderBottom: '1px solid #ccc', fontWeight: 700, backgroundColor: '#f2f2f2', fontSize: 7 },
  tableCell: { flexGrow: 1, flexBasis: 0, padding: 3, borderRight: '1px solid #ccc', borderBottom: '1px solid #ccc', fontSize: 7 },
  signRow: { flexDirection: 'row', gap: 20, marginTop: 10 },
  signBox: { flex: 1, border: '1px solid #ccc', borderRadius: 4, padding: 8, minHeight: 90 },
  signLabel: { fontSize: 7, color: '#666', textTransform: 'uppercase', marginBottom: 4 },
  signImage: { width: 140, height: 50, objectFit: 'contain' },
  signMeta: { fontSize: 7, color: '#444', marginTop: 4 },
  signPending: { fontSize: 8, color: '#999', fontStyle: 'italic', marginTop: 20 },
  footer: { position: 'absolute', bottom: 16, left: 28, right: 28, fontSize: 7, color: '#999', textAlign: 'center' },
})

function DispatchTicketDocument(props: DispatchTicketPdfInput) {
  return (
    <Document>
      <Page size="A4" style={ticketStyles.page}>
        <View style={ticketStyles.headerRow}>
          {props.logoBytes && (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <Image style={ticketStyles.logo} src={{ data: props.logoBytes, format: props.logoFormat ?? 'png' } as any} />
          )}
          <View>
            <Text style={ticketStyles.businessName}>{props.businessName}</Text>
            <Text style={ticketStyles.tagline}>via 3B Fleet Commander{props.threeBBizId ? ` — 3B Business ID: ${props.threeBBizId}` : ''}</Text>
          </View>
        </View>

        <Text style={ticketStyles.title}>Dispatch Ticket — Job {props.jobNumber}</Text>

        <View style={ticketStyles.fieldGrid}>
          <View style={ticketStyles.field}><Text style={ticketStyles.fieldLabel}>Date</Text><Text style={ticketStyles.fieldValue}>{props.date}</Text></View>
          <View style={ticketStyles.field}><Text style={ticketStyles.fieldLabel}>Truck</Text><Text style={ticketStyles.fieldValue}>{props.truckUnit ?? '—'}</Text></View>
          <View style={ticketStyles.field}><Text style={ticketStyles.fieldLabel}>Driver</Text><Text style={ticketStyles.fieldValue}>{props.driverName}</Text></View>
          {props.brokerName && <View style={ticketStyles.field}><Text style={ticketStyles.fieldLabel}>Broker</Text><Text style={ticketStyles.fieldValue}>{props.brokerName}</Text></View>}
          {props.fields.map((f, i) => (
            <View key={i} style={ticketStyles.field}>
              <Text style={ticketStyles.fieldLabel}>{f.label}</Text>
              <Text style={ticketStyles.fieldValue}>{f.value}</Text>
            </View>
          ))}
        </View>

        {props.timeline.length > 0 && (
          <>
            <Text style={ticketStyles.sectionTitle}>Time Log</Text>
            <View style={ticketStyles.table}>
              <View style={ticketStyles.tableRow} fixed>
                <Text style={ticketStyles.tableHeaderCell}>Time</Text>
                <Text style={ticketStyles.tableHeaderCell}>Event</Text>
                <Text style={ticketStyles.tableHeaderCell}>Load Tag</Text>
              </View>
              {props.timeline.map((row, i) => (
                <View key={i} style={ticketStyles.tableRow} wrap={false}>
                  <Text style={ticketStyles.tableCell}>{row.time}</Text>
                  <Text style={ticketStyles.tableCell}>{row.label}</Text>
                  <Text style={ticketStyles.tableCell}>{row.loadTag ?? ''}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={ticketStyles.signRow}>
          <View style={ticketStyles.signBox}>
            <Text style={ticketStyles.signLabel}>Company Receipt</Text>
            {props.companySignature ? (
              <>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Image style={ticketStyles.signImage} src={{ data: props.companySignature.imageBytes, format: 'png' } as any} />
                <Text style={ticketStyles.signMeta}>{props.companySignature.signedBy} — {props.companySignature.signedAt}</Text>
              </>
            ) : (
              <Text style={ticketStyles.signPending}>Not signed</Text>
            )}
          </View>
          <View style={ticketStyles.signBox}>
            <Text style={ticketStyles.signLabel}>Driver Signature</Text>
            {props.driverSignature ? (
              <>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Image style={ticketStyles.signImage} src={{ data: props.driverSignature.imageBytes, format: 'png' } as any} />
                <Text style={ticketStyles.signMeta}>{props.driverSignature.signedBy} — {props.driverSignature.signedAt}</Text>
              </>
            ) : (
              <Text style={ticketStyles.signPending}>Not signed</Text>
            )}
          </View>
        </View>

        <Text style={ticketStyles.footer} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages} — Generated via 3B Fleet Commander`} fixed />
      </Page>
    </Document>
  )
}

export async function renderDispatchTicketPdf(input: DispatchTicketPdfInput): Promise<Buffer> {
  const stream = await renderToStream(<DispatchTicketDocument {...input} />)
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

// ── Shift / weekly summary reports ──────────────────────────────────────────
// One flexible document — a stat grid plus any number of titled tables —
// reused for both the end-of-shift report (Time Log + Truck Issues sections)
// and the end-of-week report (Daily Breakdown + Truck Issues sections), so
// the two report types share layout/branding instead of each hand-rolling one.

export interface SummaryReportStat {
  label: string
  value: string
}

export interface SummaryReportSection {
  title: string
  headers: string[]
  rows: (string | number)[][]
}

export interface SummaryReportPdfInput {
  logoBytes?: Buffer | null
  logoFormat?: 'png' | 'jpg'
  businessName: string
  threeBBizId: string | null
  title: string
  subtitleLines: string[]
  stats: SummaryReportStat[]
  sections: SummaryReportSection[]
  disclaimers?: string[]
}

const summaryStyles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: 'Helvetica' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  logo: { width: 44, height: 44, objectFit: 'contain' },
  businessName: { fontSize: 15, fontWeight: 700 },
  tagline: { fontSize: 8, color: '#666' },
  title: { fontSize: 13, fontWeight: 700, marginTop: 12 },
  subtitle: { fontSize: 8, color: '#444', marginTop: 2 },
  disclaimer: { fontSize: 7, color: '#888', marginTop: 2 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12, marginBottom: 14 },
  stat: { width: '22%', border: '1px solid #ddd', borderRadius: 4, padding: 6 },
  statLabel: { fontSize: 6.5, color: '#666', textTransform: 'uppercase' },
  statValue: { fontSize: 11, fontWeight: 700 },
  sectionTitle: { fontSize: 9, fontWeight: 700, marginTop: 10, marginBottom: 4, textTransform: 'uppercase', color: '#444' },
  emptySection: { fontSize: 8, color: '#888', fontStyle: 'italic', marginBottom: 8 },
  table: { borderTop: '1px solid #ccc', borderLeft: '1px solid #ccc', marginBottom: 10 },
  tableRow: { flexDirection: 'row' },
  tableHeaderCell: { flexGrow: 1, flexBasis: 0, padding: 3, borderRight: '1px solid #ccc', borderBottom: '1px solid #ccc', fontWeight: 700, backgroundColor: '#f2f2f2', fontSize: 7 },
  tableCell: { flexGrow: 1, flexBasis: 0, padding: 3, borderRight: '1px solid #ccc', borderBottom: '1px solid #ccc', fontSize: 7 },
  footer: { position: 'absolute', bottom: 16, left: 28, right: 28, fontSize: 7, color: '#999', textAlign: 'center' },
})

function SummaryReportDocument(props: SummaryReportPdfInput) {
  return (
    <Document>
      <Page size="A4" style={summaryStyles.page}>
        <View style={summaryStyles.headerRow}>
          {props.logoBytes && (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <Image style={summaryStyles.logo} src={{ data: props.logoBytes, format: props.logoFormat ?? 'png' } as any} />
          )}
          <View>
            <Text style={summaryStyles.businessName}>{props.businessName}</Text>
            <Text style={summaryStyles.tagline}>via 3B Fleet Commander{props.threeBBizId ? ` — 3B Business ID: ${props.threeBBizId}` : ''}</Text>
          </View>
        </View>

        <Text style={summaryStyles.title}>{props.title}</Text>
        {props.subtitleLines.map((line, i) => <Text key={i} style={summaryStyles.subtitle}>{line}</Text>)}
        {(props.disclaimers ?? []).map((line, i) => <Text key={i} style={summaryStyles.disclaimer}>{line}</Text>)}

        <View style={summaryStyles.statGrid}>
          {props.stats.map((s, i) => (
            <View key={i} style={summaryStyles.stat}>
              <Text style={summaryStyles.statLabel}>{s.label}</Text>
              <Text style={summaryStyles.statValue}>{s.value}</Text>
            </View>
          ))}
        </View>

        {props.sections.map((section, si) => (
          <View key={si}>
            <Text style={summaryStyles.sectionTitle}>{section.title}</Text>
            {section.rows.length === 0 ? (
              <Text style={summaryStyles.emptySection}>None reported.</Text>
            ) : (
              <View style={summaryStyles.table}>
                <View style={summaryStyles.tableRow} fixed>
                  {section.headers.map((h, i) => <Text key={i} style={summaryStyles.tableHeaderCell}>{h}</Text>)}
                </View>
                {section.rows.map((row, r) => (
                  <View key={r} style={summaryStyles.tableRow} wrap={false}>
                    {row.map((cell, c) => <Text key={c} style={summaryStyles.tableCell}>{cell === null || cell === undefined ? '' : String(cell)}</Text>)}
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        <Text style={summaryStyles.footer} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages} — Generated via 3B Fleet Commander`} fixed />
      </Page>
    </Document>
  )
}

export async function renderSummaryReportPdf(input: SummaryReportPdfInput): Promise<Buffer> {
  const stream = await renderToStream(<SummaryReportDocument {...input} />)
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}
