'use client'
/**
 * TicketSheet — view + sign the digital dispatch ticket for a job.
 *
 * Shared between the driver cockpit ("sign at day's end") and the dispatch
 * admin panel ("Confirm Receipt" company sign-off) — which signature (if
 * any) the current viewer can provide is controlled by the `canSign` prop.
 * Field VALUES always come from the job row itself (see ticketTemplates.ts —
 * nothing is duplicated onto the ticket instance).
 */
import { useEffect, useState } from 'react'
import Sheet from './Sheet'
import SignaturePad from './SignaturePad'
import LoadTagPhotoSheet from './LoadTagPhotoSheet'
import { toast } from '@/hooks/useToast'
import { TICKET_FIELD_CATALOG } from '@/lib/fleet/dumpTruck/ticketTemplates'
import type { DumpTruckJob } from '@/lib/dumpTruck/types'

interface TicketInstanceDTO {
  id: string
  status: 'active' | 'company_signed' | 'driver_signed' | 'completed'
  companySignedBy: string | null
  companySignedAt: string | null
  driverSignedAt: string | null
  pdfStoragePath: string | null
}

export interface TicketTimelineEvent {
  id: string
  eventType: string
  effectiveAt: string
}

interface Props {
  job: DumpTruckJob
  driverDisplayName: string
  truckUnit: string | null
  canSign: 'driver' | 'company' | null
  shiftId?: string | null
  timeline?: TicketTimelineEvent[]
  onClose: () => void
}

export default function TicketSheet({ job, driverDisplayName, truckUnit, canSign, shiftId, timeline, onClose }: Props) {
  const [ticket, setTicket] = useState<TicketInstanceDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [signing, setSigning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loadTagEventId, setLoadTagEventId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetch(`/api/fleet/dump-truck/tickets?jobId=${job.id}`)
      .then(r => r.json())
      .then(b => setTicket(b.ticket ?? null))
      .finally(() => setLoading(false))
  }
  useEffect(load, [job.id])

  const submitSignature = async (blob: Blob) => {
    if (!ticket || !canSign) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append('signature', blob, 'signature.png')
      form.append('role', canSign)
      const res = await fetch(`/api/fleet/dump-truck/tickets/${ticket.id}/sign`, { method: 'POST', body: form })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save signature')
      toast.success(canSign === 'driver' ? 'Signed — ticket complete' : 'Receipt confirmed')
      setSigning(false)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save signature')
    } finally {
      setBusy(false)
    }
  }

  const fields = TICKET_FIELD_CATALOG
    .map(f => ({ label: f.label, value: job[f.key] }))
    .filter(f => f.value != null && f.value !== '')

  const canSignNow =
    !!ticket && !!canSign &&
    ticket.status !== 'completed' &&
    (canSign === 'driver' ? !ticket.driverSignedAt : !ticket.companySignedAt)

  return (
    <Sheet title={`Dispatch Ticket — ${job.jobNumber}`} onClose={onClose}>
      {loading ? (
        <div style={{ color: 'var(--muted)', padding: '1rem 0' }}>Loading…</div>
      ) : !ticket ? (
        <div style={{ color: 'var(--muted)', padding: '1rem 0' }}>No ticket yet for this job.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem .9rem', fontSize: '.85rem' }}>
            <TicketField label="Date" value={new Date().toLocaleDateString()} />
            <TicketField label="Truck" value={truckUnit ?? '—'} />
            <TicketField label="Driver" value={driverDisplayName} />
            {job.customerName && <TicketField label="Customer" value={job.customerName} />}
            {fields.map(f => <TicketField key={f.label} label={f.label} value={String(f.value)} />)}
          </div>

          {timeline && timeline.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '.75rem' }}>
              <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: '.5rem' }}>
                Time Log
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                {timeline.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.8rem' }}>
                    <span>
                      <span style={{ color: 'var(--muted)' }}>{new Date(t.effectiveAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {' — '}{t.eventType.replace(/_/g, ' ')}
                    </span>
                    {canSign === 'driver' && shiftId && (
                      <button
                        onClick={() => setLoadTagEventId(t.id)}
                        style={{
                          fontSize: '.68rem', fontWeight: 700, padding: '.2rem .5rem', borderRadius: 6,
                          background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--primary)', flexShrink: 0,
                        }}
                      >
                        📷 Load Tag
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '.75rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            <StatusLine label="Company receipt" done={!!ticket.companySignedAt} doneLabel={ticket.companySignedAt ? new Date(ticket.companySignedAt).toLocaleString() : null} />
            <StatusLine label="Driver signature" done={!!ticket.driverSignedAt} doneLabel={ticket.driverSignedAt ? new Date(ticket.driverSignedAt).toLocaleString() : null} />
          </div>

          {signing ? (
            <SignaturePad
              label={canSign === 'driver' ? 'confirms all fields and times above are correct' : 'confirms receipt of this load'}
              busy={busy}
              onCancel={() => setSigning(false)}
              onSave={submitSignature}
            />
          ) : canSignNow ? (
            <button
              onClick={() => setSigning(true)}
              style={{ width: '100%', padding: '.9rem', borderRadius: 12, background: 'var(--primary)', color: '#04140f', fontWeight: 900, fontSize: '1rem', minHeight: 52 }}
            >
              {canSign === 'driver' ? '✍️ Sign — Day Complete' : '✍️ Confirm Receipt'}
            </button>
          ) : ticket.status === 'completed' ? (
            <div style={{ fontSize: '.8rem', color: 'var(--primary)', fontWeight: 700, textAlign: 'center' }}>✓ Ticket complete — both signatures on file</div>
          ) : null}

          {ticket.pdfStoragePath && (
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`/api/fleet/dump-truck/tickets/${ticket.id}/pdf`)
                  if (!res.ok) throw new Error((await res.json()).error ?? 'Could not open PDF')
                  const { url } = await res.json()
                  window.open(url, '_blank')
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Could not open PDF')
                }
              }}
              style={{ width: '100%', padding: '.75rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 700 }}
            >
              📄 Download / Print PDF
            </button>
          )}
        </div>
      )}

      {loadTagEventId && shiftId && (
        <LoadTagPhotoSheet
          shiftId={shiftId}
          eventId={loadTagEventId}
          onClose={() => setLoadTagEventId(null)}
          onSaved={() => {}}
        />
      )}
    </Sheet>
  )
}

function TicketField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function StatusLine({ label, done, doneLabel }: { label: string; done: boolean; doneLabel: string | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontWeight: 700, color: done ? 'var(--primary)' : 'var(--muted)' }}>{done ? `✓ ${doneLabel}` : 'Pending'}</span>
    </div>
  )
}
