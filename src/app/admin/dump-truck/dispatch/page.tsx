'use client'
import { useEffect, useState, useCallback } from 'react'
import { toast } from '@/hooks/useToast'
import ToastContainer from '@/components/shared/ToastContainer'
import type { DumpTruckSite } from '@/lib/dumpTruck/types'
import type { EquipmentOption } from '@/lib/fleet/dumpTruck/equipment'
import type { DriverOption } from '@/lib/fleet/dumpTruck/jobs'
import type { Dispatch, DispatchStop, DispatchSettings } from '@/lib/fleet/dumpTruck/dispatch'
import type { ParsedDispatchFields, FieldConfidence } from '@/app/api/fleet/dump-truck/dispatch/parse/route'
import { computeArrivalRisk } from '@/lib/dumpTruck/dispatchPlanning'

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', width: '100%' }
const labelStyle: React.CSSProperties = { fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' as const }
const btnStyle: React.CSSProperties = { padding: '.65rem 1.2rem', borderRadius: 10, background: 'var(--primary)', color: '#04140f', fontWeight: 800 }
const ghostBtnStyle: React.CSSProperties = { padding: '.5rem .9rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 700, fontSize: '.82rem' }

function Field({ label, children, warn }: { label: React.ReactNode; children: React.ReactNode; warn?: string | null }) {
  return (
    <div>
      <div style={labelStyle}>{label}{warn && <span title={warn} style={{ color: 'var(--warn, #d99a2b)', marginLeft: 6 }}>⚠</span>}</div>
      {children}
    </div>
  )
}

function ConfidenceBadge({ level }: { level: FieldConfidence | undefined }) {
  if (!level) return null
  const color = level === 'high' ? 'var(--success)' : level === 'medium' ? 'var(--warn, #d99a2b)' : 'var(--error)'
  return <span style={{ fontSize: '.65rem', fontWeight: 800, color, marginLeft: 6, textTransform: 'uppercase' }}>{level}</span>
}

type FormState = {
  dispatchDate: string
  requiredArrivalTime: string
  customerName: string
  brokerName: string
  dispatchContactName: string
  dispatchContactPhone: string
  driverNameRaw: string
  truckLabelRaw: string
  yardText: string
  pickupText: string
  deliveryText: string
  material: string
  numLoadsEstimate: string
  weightRequirements: string
  ticketRequirements: string
  scaleRequired: boolean
  poNumber: string
  jobNumber: string
  specialInstructions: string
  gateInstructions: string
  contactOnArrivalInstructions: string
  safetyInstructions: string
  truckRestrictions: string
  trailerRequirements: string
  returnInstructions: string
  estDurationMinutes: string
  rateType: '' | 'hourly' | 'per_load'
  customerRate: string
  driverPayRule: string
  notes: string
}

const EMPTY_FORM: FormState = {
  dispatchDate: '', requiredArrivalTime: '', customerName: '', brokerName: '', dispatchContactName: '', dispatchContactPhone: '',
  driverNameRaw: '', truckLabelRaw: '', yardText: '', pickupText: '', deliveryText: '', material: '', numLoadsEstimate: '',
  weightRequirements: '', ticketRequirements: '', scaleRequired: false, poNumber: '', jobNumber: '', specialInstructions: '',
  gateInstructions: '', contactOnArrivalInstructions: '', safetyInstructions: '', truckRestrictions: '', trailerRequirements: '',
  returnInstructions: '', estDurationMinutes: '', rateType: '', customerRate: '', driverPayRule: '', notes: '',
}

function fieldsToForm(f: ParsedDispatchFields): FormState {
  return {
    dispatchDate: f.dispatchDate ?? '', requiredArrivalTime: f.requiredArrivalTime ?? '',
    customerName: f.customerName ?? '', brokerName: f.brokerName ?? '',
    dispatchContactName: f.dispatchContactName ?? '', dispatchContactPhone: f.dispatchContactPhone ?? '',
    driverNameRaw: f.driverName ?? '', truckLabelRaw: f.truckLabel ?? '',
    yardText: f.yard ?? '', pickupText: f.pickupLocation ?? f.startingLocation ?? '', deliveryText: f.deliveryLocation ?? '',
    material: f.material ?? '', numLoadsEstimate: f.numLoads != null ? String(f.numLoads) : '',
    weightRequirements: f.weightRequirements ?? '', ticketRequirements: f.ticketRequirements ?? '',
    scaleRequired: !!f.scaleRequired, poNumber: f.poNumber ?? '', jobNumber: f.jobNumber ?? '',
    specialInstructions: f.specialInstructions ?? '', gateInstructions: f.gateInstructions ?? '',
    contactOnArrivalInstructions: f.contactOnArrivalInstructions ?? '', safetyInstructions: f.safetyInstructions ?? '',
    truckRestrictions: f.truckRestrictions ?? '', trailerRequirements: f.trailerRequirements ?? '',
    returnInstructions: f.returnInstructions ?? '', estDurationMinutes: f.estJobDurationMinutes != null ? String(f.estJobDurationMinutes) : '',
    rateType: f.rateType ?? '', customerRate: f.customerRate != null ? String(f.customerRate) : '',
    driverPayRule: f.driverPayRule ?? '', notes: f.notes ?? '',
  }
}

export default function DispatchIntakePage() {
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [equipment, setEquipment] = useState<{ trucks: EquipmentOption[]; trailers: EquipmentOption[] }>({ trucks: [], trailers: [] })
  const [sites, setSites] = useState<DumpTruckSite[]>([])
  const [settings, setSettings] = useState<DispatchSettings | null>(null)
  const [dispatches, setDispatches] = useState<Dispatch[]>([])

  const [rawText, setRawText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [confidence, setConfidence] = useState<Record<string, FieldConfidence>>({})
  const [warnings, setWarnings] = useState<string[]>([])
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [aiParseMeta, setAiParseMeta] = useState<{ parsedJson: unknown; confidenceJson: unknown; warnings: unknown; model: string | null } | null>(null)

  const [draft, setDraft] = useState<Dispatch | null>(null)
  const [stops, setStops] = useState<DispatchStop[]>([])
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    fetch('/api/fleet/dump-truck/drivers').then(r => r.json()).then(b => setDrivers(b.drivers ?? []))
    fetch('/api/fleet/dump-truck/equipment').then(r => r.json()).then(setEquipment)
    fetch('/api/fleet/dump-truck/sites').then(r => r.json()).then(b => setSites(b.sites ?? []))
    fetch('/api/fleet/dump-truck/dispatch/settings').then(r => r.json()).then(b => setSettings(b.settings ?? null))
    fetch('/api/fleet/dump-truck/dispatch').then(r => r.json()).then(b => setDispatches(b.dispatches ?? []))
  }, [])
  useEffect(reload, [reload])

  const resetIntake = () => {
    setRawText(''); setConfidence({}); setWarnings([]); setForm(EMPTY_FORM); setAiParseMeta(null)
    setDraft(null); setStops([])
  }

  const parseWithAi = async () => {
    if (!rawText.trim()) { toast.error('Paste or type the job info first'); return }
    setParsing(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/dispatch/parse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: rawText,
          knownDrivers: drivers.map(d => d.name),
          knownTrucks: equipment.trucks.map(t => t.unitNumber),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not parse dispatch')
      setForm(fieldsToForm(body.parsed))
      setConfidence(body.confidence ?? {})
      setWarnings(body.warnings ?? [])
      setAiParseMeta({ parsedJson: body.parsed, confidenceJson: body.confidence, warnings: body.warnings, model: body.model ?? null })
      toast.success('Parsed — review the fields below before publishing')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not parse dispatch')
    } finally {
      setParsing(false)
    }
  }

  const createDraft = async () => {
    setBusy(true)
    try {
      const stopsInput = [
        ...(form.pickupText.trim() ? [{ stopType: 'pickup' as const, rawLocationText: form.pickupText.trim() }] : []),
        ...(form.deliveryText.trim() ? [{ stopType: 'delivery' as const, rawLocationText: form.deliveryText.trim() }] : []),
      ]
      const res = await fetch('/api/fleet/dump-truck/dispatch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawInput: rawText || null,
          source: aiParseMeta ? 'paste' : 'manual',
          dispatchDate: form.dispatchDate || null,
          customerName: form.customerName || null,
          brokerName: form.brokerName || null,
          dispatchContactName: form.dispatchContactName || null,
          dispatchContactPhone: form.dispatchContactPhone || null,
          poNumber: form.poNumber || null,
          jobNumber: form.jobNumber || null,
          driverNameRaw: form.driverNameRaw || null,
          truckLabelRaw: form.truckLabelRaw || null,
          requiredArrivalAt: form.dispatchDate && form.requiredArrivalTime ? `${form.dispatchDate}T${form.requiredArrivalTime}:00` : null,
          material: form.material || null,
          numLoadsEstimate: form.numLoadsEstimate ? Number(form.numLoadsEstimate) : null,
          weightRequirements: form.weightRequirements || null,
          ticketRequirements: form.ticketRequirements || null,
          scaleRequired: form.scaleRequired,
          specialInstructions: form.specialInstructions || null,
          gateInstructions: form.gateInstructions || null,
          contactOnArrivalInstructions: form.contactOnArrivalInstructions || null,
          safetyInstructions: form.safetyInstructions || null,
          truckRestrictions: form.truckRestrictions || null,
          trailerRequirements: form.trailerRequirements || null,
          returnInstructions: form.returnInstructions || null,
          estDurationMinutes: form.estDurationMinutes ? Number(form.estDurationMinutes) : null,
          rateType: form.rateType || null,
          customerRate: form.customerRate ? Number(form.customerRate) : null,
          driverPayRule: form.driverPayRule || null,
          notes: form.notes || null,
          stops: stopsInput,
          aiParse: aiParseMeta,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not save draft')
      setDraft(body.dispatch)
      toast.success('Draft saved — resolving locations…')
      await resolveAndRoute(body.dispatch.id)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save draft')
    } finally {
      setBusy(false)
    }
  }

  const resolveAndRoute = async (dispatchId: string) => {
    try {
      const resolveRes = await fetch(`/api/fleet/dump-truck/dispatch/${dispatchId}/resolve-stops`, { method: 'POST' })
      const resolveBody = await resolveRes.json()
      if (resolveRes.ok) setStops(resolveBody.stops ?? [])

      const routeRes = await fetch(`/api/fleet/dump-truck/dispatch/${dispatchId}/route-estimate`, { method: 'POST' })
      const routeBody = await routeRes.json()
      if (routeRes.ok) {
        setDraft(routeBody.dispatch)
        if (routeBody.warnings?.length) setWarnings(w => [...new Set([...w, ...routeBody.warnings])])
      }
    } catch {
      toast.error('Could not resolve locations / calculate route')
    }
  }

  const publish = async () => {
    if (!draft) return
    setBusy(true)
    try {
      const res = await fetch(`/api/fleet/dump-truck/dispatch/${draft.id}/publish`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not publish')
      toast.success(`Published — job ${body.job.jobNumber} created and driver notified`)
      resetIntake()
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not publish')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (id: string) => {
    if (!confirm('Cancel this dispatch?')) return
    try {
      const res = await fetch(`/api/fleet/dump-truck/dispatch/${id}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Cancelled by dispatch' }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not cancel')
      toast.success('Dispatch cancelled')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not cancel')
    }
  }

  const driverName = (id: string | null) => drivers.find(d => d.userId === id)?.name ?? null
  const truckUnit = (id: string | null) => equipment.trucks.find(t => t.id === id)?.unitNumber ?? null

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 1200, margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>AI Dispatch Intake &amp; Trip Planning</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 4 }}>
          Paste or type an incoming job — AI turns it into a structured, editable draft. Nothing publishes to a
          driver until you review and confirm it here.
        </p>
      </div>

      <div style={cardStyle}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.5rem' }}>Add Dispatch / Paste Job Information</h2>
        <textarea
          style={{ ...inputStyle, minHeight: 90 }}
          placeholder={'e.g. "Tomorrow David truck 07 Penny Knight. Be at Lockwood by 6:30. Pick up base from XYZ pit, take to Virginia St project. Probably 6 loads. Call John when arriving. Scale tickets required."'}
          value={rawText}
          onChange={e => setRawText(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: '.75rem' }}>
          <button style={{ ...btnStyle, opacity: parsing ? .5 : 1 }} disabled={parsing} onClick={parseWithAi}>
            {parsing ? 'Parsing…' : '✨ Parse with AI'}
          </button>
          <button style={ghostBtnStyle} onClick={() => { setConfidence({}); setWarnings([]); setAiParseMeta(null) }}>
            Fill in manually instead
          </button>
          {(draft || rawText || form !== EMPTY_FORM) && <button style={ghostBtnStyle} onClick={resetIntake}>Start Over</button>}
        </div>
      </div>

      {(aiParseMeta || form.dispatchDate || form.pickupText || draft) && (
        <div style={{ ...cardStyle, border: '1px solid rgba(0,232,176,.35)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.25rem' }}>
            {aiParseMeta ? 'AI Parsed Dispatch — Review Before Publishing' : 'Dispatch Details'}
          </h2>
          {warnings.length > 0 && (
            <div style={{ margin: '.5rem 0 1rem', padding: '.6rem .8rem', borderRadius: 8, background: 'rgba(217,154,43,.08)', border: '1px solid rgba(217,154,43,.3)' }}>
              {warnings.map((w, i) => <div key={i} style={{ fontSize: '.78rem', color: 'var(--warn, #d99a2b)' }}>⚠️ {w}</div>)}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem' }}>
            <Field label={<>Date <ConfidenceBadge level={confidence.dispatchDate} /></>}>
              <input style={inputStyle} type="date" value={form.dispatchDate} onChange={e => setForm({ ...form, dispatchDate: e.target.value })} />
            </Field>
            <Field label={<>Required First-Site Arrival <ConfidenceBadge level={confidence.requiredArrivalTime} /></>}>
              <input style={inputStyle} type="time" value={form.requiredArrivalTime} onChange={e => setForm({ ...form, requiredArrivalTime: e.target.value })} />
            </Field>
            <Field label={<>Driver <ConfidenceBadge level={confidence.driverName} /></>}>
              <input style={inputStyle} list="driver-names" value={form.driverNameRaw} onChange={e => setForm({ ...form, driverNameRaw: e.target.value })} />
              <datalist id="driver-names">{drivers.map(d => <option key={d.userId} value={d.name} />)}</datalist>
            </Field>
            <Field label={<>Truck <ConfidenceBadge level={confidence.truckLabel} /></>}>
              <input style={inputStyle} list="truck-units" placeholder="uses driver's default if blank" value={form.truckLabelRaw} onChange={e => setForm({ ...form, truckLabelRaw: e.target.value })} />
              <datalist id="truck-units">{equipment.trucks.map(t => <option key={t.id} value={t.unitNumber} />)}</datalist>
            </Field>
            <Field label={<>Customer <ConfidenceBadge level={confidence.customerName} /></>}>
              <input style={inputStyle} value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} />
            </Field>
            <Field label={<>Broker <ConfidenceBadge level={confidence.brokerName} /></>}>
              <input style={inputStyle} value={form.brokerName} onChange={e => setForm({ ...form, brokerName: e.target.value })} />
            </Field>
            <Field label={<>Dispatch Contact <ConfidenceBadge level={confidence.dispatchContactName} /></>}>
              <input style={inputStyle} value={form.dispatchContactName} onChange={e => setForm({ ...form, dispatchContactName: e.target.value })} />
            </Field>
            <Field label={<>Contact Phone <ConfidenceBadge level={confidence.dispatchContactPhone} /></>}>
              <input style={inputStyle} value={form.dispatchContactPhone} onChange={e => setForm({ ...form, dispatchContactPhone: e.target.value })} />
            </Field>
            <Field label={<>Pickup / First Location <ConfidenceBadge level={confidence.pickupLocation} /></>}>
              <input style={inputStyle} value={form.pickupText} onChange={e => setForm({ ...form, pickupText: e.target.value })} />
            </Field>
            <Field label={<>Delivery Location <ConfidenceBadge level={confidence.deliveryLocation} /></>}>
              <input style={inputStyle} value={form.deliveryText} onChange={e => setForm({ ...form, deliveryText: e.target.value })} />
            </Field>
            <Field label={<>Material <ConfidenceBadge level={confidence.material} /></>}>
              <input style={inputStyle} value={form.material} onChange={e => setForm({ ...form, material: e.target.value })} />
            </Field>
            <Field label={<>Est. Loads <ConfidenceBadge level={confidence.numLoads} /></>}>
              <input style={inputStyle} type="number" value={form.numLoadsEstimate} onChange={e => setForm({ ...form, numLoadsEstimate: e.target.value })} />
            </Field>
            <Field label="PO Number"><input style={inputStyle} value={form.poNumber} onChange={e => setForm({ ...form, poNumber: e.target.value })} /></Field>
            <Field label="Job Number"><input style={inputStyle} value={form.jobNumber} onChange={e => setForm({ ...form, jobNumber: e.target.value })} /></Field>
            <Field label="Weight Requirements"><input style={inputStyle} value={form.weightRequirements} onChange={e => setForm({ ...form, weightRequirements: e.target.value })} /></Field>
            <Field label="Ticket Requirements"><input style={inputStyle} value={form.ticketRequirements} onChange={e => setForm({ ...form, ticketRequirements: e.target.value })} /></Field>
            <Field label="Scale Required">
              <select style={inputStyle} value={form.scaleRequired ? 'yes' : 'no'} onChange={e => setForm({ ...form, scaleRequired: e.target.value === 'yes' })}>
                <option value="no">No</option><option value="yes">Yes</option>
              </select>
            </Field>
            <Field label="Rate Type">
              <select style={inputStyle} value={form.rateType} onChange={e => setForm({ ...form, rateType: e.target.value as FormState['rateType'] })}>
                <option value="">Not set</option><option value="hourly">Hourly</option><option value="per_load">Per Load</option>
              </select>
            </Field>
            {form.rateType && <Field label="Customer Rate ($)"><input style={inputStyle} type="number" step="0.01" value={form.customerRate} onChange={e => setForm({ ...form, customerRate: e.target.value })} /></Field>}
            <Field label="Driver Pay Rule"><input style={inputStyle} value={form.driverPayRule} onChange={e => setForm({ ...form, driverPayRule: e.target.value })} /></Field>
            <Field label="Est. Job Duration (min)"><input style={inputStyle} type="number" value={form.estDurationMinutes} onChange={e => setForm({ ...form, estDurationMinutes: e.target.value })} /></Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem', marginTop: '.75rem' }}>
            <Field label="Special Instructions"><textarea style={{ ...inputStyle, minHeight: 50 }} value={form.specialInstructions} onChange={e => setForm({ ...form, specialInstructions: e.target.value })} /></Field>
            <Field label="Gate Instructions"><textarea style={{ ...inputStyle, minHeight: 50 }} value={form.gateInstructions} onChange={e => setForm({ ...form, gateInstructions: e.target.value })} /></Field>
            <Field label="Contact-on-Arrival Instructions"><textarea style={{ ...inputStyle, minHeight: 50 }} value={form.contactOnArrivalInstructions} onChange={e => setForm({ ...form, contactOnArrivalInstructions: e.target.value })} /></Field>
            <Field label="Safety Instructions"><textarea style={{ ...inputStyle, minHeight: 50 }} value={form.safetyInstructions} onChange={e => setForm({ ...form, safetyInstructions: e.target.value })} /></Field>
            <Field label="Truck Restrictions"><textarea style={{ ...inputStyle, minHeight: 50 }} value={form.truckRestrictions} onChange={e => setForm({ ...form, truckRestrictions: e.target.value })} /></Field>
            <Field label="Trailer Requirements"><textarea style={{ ...inputStyle, minHeight: 50 }} value={form.trailerRequirements} onChange={e => setForm({ ...form, trailerRequirements: e.target.value })} /></Field>
            <Field label="Return Instructions"><textarea style={{ ...inputStyle, minHeight: 50 }} value={form.returnInstructions} onChange={e => setForm({ ...form, returnInstructions: e.target.value })} /></Field>
            <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 50 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>

          {!draft && (
            <button style={{ ...btnStyle, marginTop: '1rem', opacity: busy ? .5 : 1 }} disabled={busy} onClick={createDraft}>
              {busy ? 'Saving…' : 'Save Draft & Calculate Route'}
            </button>
          )}

          {draft && (
            <DraftReview
              draft={draft}
              stops={stops}
              sites={sites}
              drivers={drivers}
              equipment={equipment}
              settings={settings}
              busy={busy}
              onRecalculate={() => resolveAndRoute(draft.id)}
              onAssign={async (driverId, truckId, trailerId) => {
                const res = await fetch(`/api/fleet/dump-truck/dispatch/${draft.id}/assign`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ driverId, truckId, trailerId }),
                })
                const body = await res.json()
                if (res.ok) { setDraft(body.dispatch); await resolveAndRoute(draft.id) }
                else toast.error(body.error ?? 'Could not assign')
              }}
              onPublish={publish}
            />
          )}
        </div>
      )}

      <div style={cardStyle}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.75rem' }}>Dispatch Board</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                <th style={{ padding: '.4rem 0' }}>Driver</th><th>Truck</th><th>Yard Time</th><th>Leave</th>
                <th>First Site</th><th>Required</th><th>ETA</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {dispatches.map(d => (
                <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '.4rem 0' }}>{driverName(d.driverId) ?? d.driverNameRaw ?? '—'}</td>
                  <td>{truckUnit(d.truckId) ?? d.truckLabelRaw ?? '—'}</td>
                  <td>{fmtTime(d.recommendedYardArrivalAt)}</td>
                  <td>{fmtTime(d.recommendedLeaveYardAt)}</td>
                  <td>{d.customerName ?? '—'}</td>
                  <td>{fmtTime(d.requiredArrivalAt)}</td>
                  <td>{fmtTime(d.targetSiteArrivalAt)}</td>
                  <td><StatusPill dispatch={d} maxLateMinutes={settings?.maxLateMinutes ?? 10} /></td>
                  <td>
                    {d.status !== 'cancelled' && (
                      <button onClick={() => cancel(d.id)} style={{ fontSize: '.72rem', color: 'var(--error)', fontWeight: 700 }}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
              {dispatches.length === 0 && <tr><td colSpan={9} style={{ padding: '1rem 0', color: 'var(--muted)' }}>No dispatches yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * Published + today + still has a required arrival ahead of "now" gets a
 * live ON TIME / AT RISK / LATE badge (spec §Delays), computed against the
 * wall clock as the current estimated arrival. This is a floor-level
 * approximation, not a live-GPS ETA recompute (no continuous location feed
 * is wired into this build) — see the deliverable notes.
 */
function StatusPill({ dispatch, maxLateMinutes }: { dispatch: Dispatch; maxLateMinutes: number }) {
  if (dispatch.status === 'cancelled') return <Pill label="Cancelled" color="var(--error)" />
  if (dispatch.status === 'draft') return <Pill label="Draft" color="var(--muted)" />

  const today = new Date().toISOString().slice(0, 10)
  if (dispatch.dispatchDate === today && dispatch.requiredArrivalAt) {
    const risk = computeArrivalRisk(new Date().toISOString(), dispatch.requiredArrivalAt, maxLateMinutes)
    if (risk === 'late') return <Pill label="LATE" color="var(--error)" />
    if (risk === 'at_risk') return <Pill label="AT RISK" color="var(--warn, #d99a2b)" />
  }
  return <Pill label="Published" color="var(--success)" />
}

function Pill({ label, color }: { label: string; color: string }) {
  return <span style={{ fontSize: '.72rem', fontWeight: 800, color, border: `1px solid ${color}`, borderRadius: 999, padding: '.15rem .55rem' }}>{label}</span>
}

function DraftReview({ draft, stops, sites, drivers, equipment, settings, busy, onRecalculate, onAssign, onPublish }: {
  draft: Dispatch
  stops: DispatchStop[]
  sites: DumpTruckSite[]
  drivers: DriverOption[]
  equipment: { trucks: EquipmentOption[]; trailers: EquipmentOption[] }
  settings: DispatchSettings | null
  busy: boolean
  onRecalculate: () => void
  onAssign: (driverId: string | null, truckId: string | null, trailerId: string | null) => void
  onPublish: () => void
}) {
  const missing: string[] = []
  if (!draft.dispatchDate) missing.push('date')
  if (!draft.driverId) missing.push('driver (not matched to a registered driver — assign one below)')
  if (!draft.truckId) missing.push('truck')
  if (!draft.requiredArrivalAt) missing.push('required arrival time')
  const firstStop = stops.find(s => s.stopType === 'pickup')
  if (!firstStop?.siteId) missing.push('first location (not matched to a known site)')

  return (
    <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '.5rem' }}>Locations &amp; Route</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '.75rem' }}>
        {stops.map(s => (
          <div key={s.id} style={{ fontSize: '.82rem', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 700, textTransform: 'capitalize', minWidth: 70 }}>{s.stopType}:</span>
            <span>&quot;{s.rawLocationText}&quot;</span>
            {s.siteId
              ? <span style={{ color: 'var(--success)' }}>→ matched {s.siteName} <ConfidenceBadge level={s.siteConfidence ?? undefined} /></span>
              : <span style={{ color: 'var(--warn, #d99a2b)' }}>⚠ not matched to a known site — geocoded best-effort, please confirm</span>}
          </div>
        ))}
        {stops.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.8rem' }}>No pickup/delivery location captured yet.</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.6rem', marginBottom: '.75rem' }}>
        <TimeStat label="Yard Arrival" value={fmtTime(draft.recommendedYardArrivalAt)} />
        <TimeStat label="Pre-Trip" value={settings ? `${settings.defaultPretripMinutes} min` : '—'} />
        <TimeStat label="Leave Yard" value={fmtTime(draft.recommendedLeaveYardAt)} />
        <TimeStat label="Drive Time" value={draft.calculatedDriveMinutes != null ? `${Math.round(draft.calculatedDriveMinutes)} min` : '—'} />
        <TimeStat label="Target Arrival" value={fmtTime(draft.targetSiteArrivalAt)} />
        <TimeStat label="Required Arrival" value={fmtTime(draft.requiredArrivalAt)} highlight />
      </div>
      <button style={ghostBtnStyle} onClick={onRecalculate}>↻ Recalculate Route</button>

      <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: '1.25rem 0 .5rem' }}>Assign Driver &amp; Truck</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.6rem' }}>
        <Field label="Driver">
          <select style={inputStyle} value={draft.driverId ?? ''} onChange={e => onAssign(e.target.value || null, draft.truckId, draft.trailerId)}>
            <option value="">Unassigned{draft.driverNameRaw ? ` (typed: ${draft.driverNameRaw})` : ''}</option>
            {drivers.map(d => <option key={d.userId} value={d.userId}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Truck">
          <select style={inputStyle} value={draft.truckId ?? ''} onChange={e => onAssign(draft.driverId, e.target.value || null, draft.trailerId)}>
            <option value="">Unassigned{draft.truckLabelRaw ? ` (typed: ${draft.truckLabelRaw})` : ''}</option>
            {equipment.trucks.map(t => <option key={t.id} value={t.id}>{t.unitNumber}</option>)}
          </select>
        </Field>
        <Field label="Trailer">
          <select style={inputStyle} value={draft.trailerId ?? ''} onChange={e => onAssign(draft.driverId, draft.truckId, e.target.value || null)}>
            <option value="">None</option>
            {equipment.trailers.map(t => <option key={t.id} value={t.id}>{t.unitNumber}</option>)}
          </select>
        </Field>
      </div>
      {sites.length === 0 && <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 6 }}>No sites configured yet — add sites on the Dump Truck Setup page for route calculation to work.</p>}

      {missing.length > 0 && (
        <div style={{ marginTop: '1rem', padding: '.6rem .8rem', borderRadius: 8, background: 'rgba(224,80,80,.08)', border: '1px solid rgba(224,80,80,.3)' }}>
          <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--error)' }}>Cannot publish yet — missing/unconfirmed:</div>
          <div style={{ fontSize: '.78rem', color: 'var(--error)' }}>{missing.join(', ')}</div>
        </div>
      )}

      <button style={{ ...btnStyle, marginTop: '1rem', opacity: busy || missing.length > 0 ? .5 : 1 }} disabled={busy || missing.length > 0} onClick={onPublish}>
        {busy ? 'Publishing…' : 'Publish to Driver'}
      </button>
    </div>
  )
}

function TimeStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ padding: '.6rem .7rem', borderRadius: 8, background: 'var(--surface-2)', border: highlight ? '1px solid var(--primary)' : '1px solid var(--border)' }}>
      <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 800 }}>{value}</div>
    </div>
  )
}
