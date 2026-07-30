/**
 * lib/tax/form1099nec.ts — Form 1099-NEC (Copy B / Copy C), 2026-07-30
 *
 * IMPORTANT: this renders Copy B ("For Recipient" — give to the driver)
 * and Copy C ("For Payer" — keep for your records). Both are fine to print
 * on plain paper per IRS General Instructions for Certain Information
 * Returns. This is NOT Copy A — the copy filed with the IRS must either be
 * the official red-ink scannable form, or e-filed electronically (IRS's
 * free IRIS system at irs.gov/iris, or any 1099 e-file service, or your
 * accountant) using the box values shown here. Never present this PDF as
 * something to mail to the IRS as-is.
 *
 * Box 4 (Federal income tax withheld) is deliberately always $0.00 here —
 * that box is for actual IRS backup withholding a payer remitted, a
 * distinct legal obligation from the "suggested withholding" savings
 * estimate this app shows drivers on their weekly pay (see taxTips.ts) —
 * conflating the two would misstate a real tax form.
 */

import { Document, Page, Text, View, StyleSheet, renderToStream } from '@react-pdf/renderer'

export interface Form1099NecInput {
  taxYear: number
  payerName: string
  payerEin: string | null
  payerAddress: { line1: string | null; city: string | null; state: string | null; postalCode: string | null }
  recipientName: string
  recipientTin: string | null
  recipientTinType: 'ssn' | 'ein' | null
  recipientAddress: { line1: string | null; city: string | null; state: string | null; postalCode: string | null }
  nonemployeeCompensation: number
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: 'Helvetica' },
  copyLabel: { fontSize: 11, fontWeight: 700, marginBottom: 4 },
  copySubLabel: { fontSize: 8, color: '#555', marginBottom: 14 },
  title: { fontSize: 13, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 9, color: '#444', marginBottom: 14 },
  row: { flexDirection: 'row', gap: 14, marginBottom: 10 },
  box: { flex: 1, border: '1px solid #999', borderRadius: 3, padding: 8 },
  boxLabel: { fontSize: 7, color: '#666', textTransform: 'uppercase', marginBottom: 3 },
  boxValue: { fontSize: 10, fontWeight: 700 },
  compBox: { border: '2px solid #000', borderRadius: 3, padding: 10, marginBottom: 14, alignItems: 'center' },
  compLabel: { fontSize: 8, color: '#444', marginBottom: 3 },
  compValue: { fontSize: 18, fontWeight: 700 },
  disclaimer: { fontSize: 7, color: '#666', marginTop: 14, lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 20, left: 32, right: 32, fontSize: 7, color: '#999', textAlign: 'center' },
})

function addr(a: Form1099NecInput['payerAddress']): string {
  return [a.line1, [a.city, a.state, a.postalCode].filter(Boolean).join(', ')].filter(Boolean).join(' — ') || '—'
}

function maskTin(tin: string | null): string {
  if (!tin) return '—'
  const digits = tin.replace(/\D/g, '')
  return digits.length >= 4 ? `•••-••-${digits.slice(-4)}` : '—'
}

function CopyPage({ input, copyLabel, copySubLabel, showFullTin }: {
  input: Form1099NecInput; copyLabel: string; copySubLabel: string; showFullTin: boolean
}) {
  return (
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.copyLabel}>{copyLabel}</Text>
      <Text style={styles.copySubLabel}>{copySubLabel}</Text>
      <Text style={styles.title}>Form 1099-NEC — Nonemployee Compensation</Text>
      <Text style={styles.subtitle}>Tax Year {input.taxYear}</Text>

      <View style={styles.row}>
        <View style={styles.box}>
          <Text style={styles.boxLabel}>Payer</Text>
          <Text style={styles.boxValue}>{input.payerName}</Text>
          <Text style={{ fontSize: 8, marginTop: 3 }}>{addr(input.payerAddress)}</Text>
        </View>
        <View style={styles.box}>
          <Text style={styles.boxLabel}>Payer's TIN (EIN)</Text>
          <Text style={styles.boxValue}>{input.payerEin ?? '—'}</Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.box}>
          <Text style={styles.boxLabel}>Recipient</Text>
          <Text style={styles.boxValue}>{input.recipientName}</Text>
          <Text style={{ fontSize: 8, marginTop: 3 }}>{addr(input.recipientAddress)}</Text>
        </View>
        <View style={styles.box}>
          <Text style={styles.boxLabel}>Recipient's TIN ({input.recipientTinType === 'ein' ? 'EIN' : 'SSN'})</Text>
          <Text style={styles.boxValue}>{showFullTin ? (input.recipientTin ?? '—') : maskTin(input.recipientTin)}</Text>
        </View>
      </View>

      <View style={styles.compBox}>
        <Text style={styles.compLabel}>Box 1 — Nonemployee Compensation</Text>
        <Text style={styles.compValue}>${input.nonemployeeCompensation.toFixed(2)}</Text>
      </View>

      <View style={styles.row}>
        <View style={styles.box}>
          <Text style={styles.boxLabel}>Box 4 — Federal Income Tax Withheld</Text>
          <Text style={styles.boxValue}>$0.00</Text>
        </View>
      </View>

      <Text style={styles.disclaimer}>
        This is a substitute Copy {copyLabel.includes('B') ? 'B' : 'C'} generated by 3B Fleet Commander for record-keeping —
        it is NOT the official IRS-scannable Copy A. The copy actually filed with the IRS must be submitted either as the
        official red-ink Copy A form or e-filed electronically (the IRS's free IRIS system at irs.gov/iris, a 1099 e-file
        service, or your accountant/tax preparer) using the box values shown above. This tool does not file anything with
        the IRS on your behalf. Consult a tax professional for guidance specific to your situation.
      </Text>

      <Text style={styles.footer} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages} — Generated via 3B Fleet Commander`} fixed />
    </Page>
  )
}

export async function renderForm1099NecPdf(input: Form1099NecInput): Promise<Buffer> {
  const stream = await renderToStream(
    <Document>
      <CopyPage input={input} copyLabel="Copy B — For Recipient" copySubLabel="This is important tax information and is being furnished to the IRS. Keep for your records." showFullTin />
      <CopyPage input={input} copyLabel="Copy C — For Payer" copySubLabel="For Payer's records. Retain for at least 4 years." showFullTin />
    </Document>,
  )
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}
