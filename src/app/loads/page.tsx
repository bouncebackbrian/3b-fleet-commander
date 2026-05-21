'use client'
import { useState, useEffect, useMemo } from 'react'
import TopBar from '@/components/layout/TopBar'
import KpiCard from '@/components/ui/KpiCard'
import LoadBadge from '@/components/ui/LoadBadge'
import { supabase } from '@/lib/supabase'
import { SAMPLE_LOADS } from '@/lib/store'
import { loadSettings } from '@/lib/settings'
import { scoreLoad, getDieselPrice, getMpgDefault, fuelIntel } from '@/lib/scoreLoad'
import type { Load, MoveType } from '@/types'
import type { RigType, MarginFlag, ScoreVerdict } from '@/lib/scoreLoad'

// ── Format helpers ────────────────────────────────────────────────────────────
const fmt  = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })
const fmtM = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtR = (n: number) => '$' + n.toFixed(2)

// ── Types ─────────────────────────────────────────────────────────────────────
const MOVES: MoveType[]  = ['Loaded','Relay / Drop','Drop & Hook','Yard Move','Deadhead','Personal']
const LOAD_TYPES         = ['FTL','LTL','Flatbed','Drop & Hook','Live Load','Reefer','Hotshot','Hazmat','Oversize']
const RIG_OPTS: { id: RigType; label: string; mpg: number }[] = [
  { id: 'semi-solo',  label: 'Class 8 Semi (Solo)',  mpg: 7.5  },
  { id: 'semi-team',  label: 'Class 8 Semi (Team)',  mpg: 7.5  },
  { id: 'hotshot',    label: 'Hotshot Dually',        mpg: 12.0 },
]

type HOSData = { driveRemainingHrs?: number; shiftRemainingHrs?: number; cycleRemainingHrs?: number }

// Extended load — Load + extra operational meta fields
interface ExtendedLoad extends Load {
  commodity?: string; weight?: string; loadType?: string
  grossRate?: string; pickup?: string; delivery?: string
  rigType?: RigType; driverMode?: 'Solo' | 'Team'; fuelPrice?: string
  reloadKnown?: boolean; reloadAreaStrength?: 1 | 2 | 3; hasOvernightParking?: boolean
}

// Extended form — new fields stored in notes [META:{json}]
type F = {
  // existing DB fields
  date: string; loadNumber: string; bolRef: string; dispatcher: string
  broker: string; trailer: string; moveType: MoveType
  origin: string; destination: string
  dispatchMiles: string; actualMiles: string; deadheadMiles: string; paidMiles: string
  cpmRate: string; fuelCost: string; waitHours: string
  detentionHours: string; detentionPay: string; settlementPay: string; notes: string
  // new operational fields (stored in META)
  commodity: string; weight: string; loadType: string; grossRate: string
  pickup: string; delivery: string
  rigType: RigType; driverMode: 'Solo' | 'Team'; fuelPrice: string
  reloadKnown: boolean; reloadAreaStrength: 1 | 2 | 3; hasOvernightParking: boolean
  detentionRate: string; tonuRate: string; lumperCost: string; permitRequired: boolean
}

const BLANK: F = {
  date: new Date().toISOString().slice(0,10), loadNumber: '', bolRef: '', dispatcher: 'Trev',
  broker: '', trailer: '', moveType: 'Loaded',
  origin: '', destination: '',
  dispatchMiles: '', actualMiles: '', deadheadMiles: '0', paidMiles: '',
  cpmRate: '0.55', fuelCost: '', waitHours: '0',
  detentionHours: '', detentionPay: '', settlementPay: '', notes: '',
  commodity: '', weight: '', loadType: 'FTL', grossRate: '',
  pickup: '', delivery: '',
  rigType: 'semi-solo', driverMode: 'Solo', fuelPrice: '3.85',
  reloadKnown: false, reloadAreaStrength: 2, hasOvernightParking: false,
  detentionRate: '', tonuRate: '', lumperCost: '', permitRequired: false,
}

// ── META encode / decode in notes field ──────────────────────────────────────
// TECH DEBT: Storing extra operational fields as a [META:{json}] suffix inside the
// `notes` text column is a zero-migration MVP workaround. These fields (commodity,
// weight, gross_rate, pickup, delivery, rig_type, reload_known, reload_area_strength,
// has_overnight_parking, etc.) should eventually be promoted to real Supabase columns
// or a dedicated `load_meta` table to enable proper querying, indexing, and reporting.
// Tracked: "Migrate [META:] storage to proper schema columns"
function encodeMeta(f: F): string {
  const meta = {
    commodity: f.commodity, weight: f.weight, loadType: f.loadType,
    grossRate: f.grossRate, pickup: f.pickup, delivery: f.delivery,
    rigType: f.rigType, driverMode: f.driverMode, fuelPrice: f.fuelPrice,
    reloadKnown: f.reloadKnown, reloadAreaStrength: f.reloadAreaStrength,
    hasOvernightParking: f.hasOvernightParking,
    detentionRate: f.detentionRate, tonuRate: f.tonuRate,
    lumperCost: f.lumperCost, permitRequired: f.permitRequired,
  }
  const base = f.notes.replace(/\n?\[META:[^\]]+\]/g, '').trim()
  return base ? `${base}\n[META:${JSON.stringify(meta)}]` : `[META:${JSON.stringify(meta)}]`
}

function decodeMeta(notes: string | null): Partial<F> {
  if (!notes) return {}
  const m = notes.match(/\[META:(.*?)\]$/)
  if (!m) return {}
  try { return JSON.parse(m[1]) } catch { return {} }
}

function userNotes(notes: string | null): string {
  if (!notes) return ''
  return notes.replace(/\n?\[META:[^\]]+\]$/, '').trim()
}

// ── DB helpers ────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDB(r: any): ExtendedLoad {
  const meta = decodeMeta(r.notes)
  return {
    id: r.id, date: r.date, loadNumber: r.load_number, bolRef: r.bol_ref ?? undefined,
    dispatcher: r.dispatcher, broker: r.broker ?? undefined, trailer: r.trailer ?? undefined,
    moveType: r.move_type as MoveType, origin: r.origin, destination: r.destination,
    status: 'Complete' as const,
    dispatchMiles: Number(r.dispatch_miles) || 0, actualMiles: Number(r.actual_miles) || 0,
    deadheadMiles: Number(r.deadhead_miles) || 0, paidMiles: Number(r.paid_miles) || 0,
    cpmRate: Number(r.cpm_rate) || 0.55, fuelCost: Number(r.fuel_cost) || 0,
    waitHours: Number(r.wait_hours) || 0, detentionHours: Number(r.detention_hours) || 0,
    detentionPay: Number(r.detention_pay) || 0, settlementPay: Number(r.settlement_pay) || 0,
    notes: userNotes(r.notes) || undefined, proofSaved: Boolean(r.proof_saved),
    settlementVerified: Boolean(r.settlement_verified),
    createdAt: r.created_at, updatedAt: r.updated_at,
    // meta fields
    commodity: meta.commodity || '', weight: meta.weight || '',
    loadType: meta.loadType || 'FTL', grossRate: meta.grossRate || '',
    pickup: meta.pickup || '', delivery: meta.delivery || '',
    rigType: (meta.rigType as RigType) || 'semi-solo',
    driverMode: (meta.driverMode as 'Solo'|'Team') || 'Solo',
    fuelPrice: meta.fuelPrice || '3.85',
  }
}

function toDB(f: F) {
  const n = (k: keyof F) => Number(f[k]) || 0
  return {
    date: f.date, load_number: f.loadNumber, bol_ref: f.bolRef || null,
    dispatcher: f.dispatcher, broker: f.broker || null, trailer: f.trailer || null,
    move_type: f.moveType, origin: f.origin, destination: f.destination,
    dispatch_miles: n('dispatchMiles'), actual_miles: n('actualMiles'),
    deadhead_miles: n('deadheadMiles'), paid_miles: n('paidMiles'),
    cpm_rate: n('cpmRate') || 0.55, fuel_cost: n('fuelCost'),
    wait_hours: n('waitHours'), detention_hours: n('detentionHours'),
    detention_pay: n('detentionPay'), settlement_pay: n('settlementPay'),
    notes: encodeMeta(f) || null, updated_at: new Date().toISOString(),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toForm(l: any): F {
  return {
    date: l.date, loadNumber: l.loadNumber, bolRef: l.bolRef || '',
    dispatcher: l.dispatcher, broker: l.broker || '', trailer: l.trailer || '',
    moveType: l.moveType, origin: l.origin, destination: l.destination,
    dispatchMiles: String(l.dispatchMiles), actualMiles: String(l.actualMiles),
    deadheadMiles: String(l.deadheadMiles), paidMiles: String(l.paidMiles),
    cpmRate: String(l.cpmRate), fuelCost: String(l.fuelCost),
    waitHours: String(l.waitHours), detentionHours: String(l.detentionHours),
    detentionPay: String(l.detentionPay), settlementPay: String(l.settlementPay),
    notes: l.notes || '',
    commodity: l.commodity || '', weight: l.weight || '',
    loadType: l.loadType || 'FTL', grossRate: l.grossRate || '',
    pickup: l.pickup || '', delivery: l.delivery || '',
    rigType: l.rigType || 'semi-solo', driverMode: l.driverMode || 'Solo',
    fuelPrice: l.fuelPrice || '3.85',
    reloadKnown: Boolean(l.reloadKnown), reloadAreaStrength: l.reloadAreaStrength || 2,
    hasOvernightParking: Boolean(l.hasOvernightParking),
    detentionRate: l.detentionRate || '', tonuRate: l.tonuRate || '',
    lumperCost: l.lumperCost || '', permitRequired: Boolean(l.permitRequired),
  }
}

function exportCSV(loads: ExtendedLoad[]) {
  const hdr = ['Date','Load #','Broker','Origin','Destination','Mi','DH mi','Gross $','Net RPM','Fuel $','Wait h','Score','Margin','Notes']
  const rows = loads.map(l => {
    const gr = Number(l.grossRate) || 0
    const mi = l.dispatchMiles || 0
    const dh = l.deadheadMiles || 0
    const fp = Number(l.fuelPrice) || 3.85
    const mpg = getMpgDefault(l.rigType || 'semi-solo')
    const fc = ((mi + dh) / mpg) * fp
    const rpm = (mi + dh) > 0 ? (gr / (mi + dh)).toFixed(2) : ''
    return [l.date, l.loadNumber, l.broker||'', l.origin, l.destination,
      mi, dh, gr, rpm, fc.toFixed(2), l.waitHours, '', '', l.notes||'']
      .map(v => `"${String(v).replace(/"/g,'""')}"`)
      .join(',')
  })
  const a = document.createElement('a')
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent([hdr.join(','), ...rows].join('\n'))
  a.download = `loads-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
}

// ── Verdict chips ─────────────────────────────────────────────────────────────
const verdictStyle = (v: ScoreVerdict | null): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', padding: '.2rem .6rem',
  borderRadius: 6, fontWeight: 800, fontSize: '.65rem', letterSpacing: '.07em',
  background: v === 'TAKE' ? 'rgba(40,192,72,.12)' : v === 'AVOID' ? 'rgba(232,64,0,.12)' : 'rgba(245,194,0,.12)',
  color: v === 'TAKE' ? 'var(--success)' : v === 'AVOID' ? 'var(--error)' : 'var(--warn)',
  border: `1px solid ${v === 'TAKE' ? 'rgba(40,192,72,.25)' : v === 'AVOID' ? 'rgba(232,64,0,.25)' : 'rgba(245,194,0,.25)'}`,
})
const marginStyle = (m: MarginFlag | null): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', padding: '.2rem .6rem',
  borderRadius: 6, fontWeight: 800, fontSize: '.65rem', letterSpacing: '.07em',
  background: m === 'STRONG' ? 'rgba(40,192,72,.12)' : m === 'OK' ? 'rgba(0,232,176,.1)' : m === 'MARGINAL' ? 'rgba(245,194,0,.12)' : 'rgba(232,64,0,.12)',
  color: m === 'STRONG' ? 'var(--success)' : m === 'OK' ? 'var(--primary)' : m === 'MARGINAL' ? 'var(--warn)' : 'var(--error)',
  border: `1px solid ${m === 'STRONG' ? 'rgba(40,192,72,.25)' : m === 'OK' ? 'rgba(0,232,176,.2)' : m === 'MARGINAL' ? 'rgba(245,194,0,.25)' : 'rgba(232,64,0,.25)'}`,
})

// ── Driver Packet ─────────────────────────────────────────────────────────────
interface DriverPacket {
  loadNumber: string; broker: string; date: string
  origin: string; destination: string
  pickup: string; delivery: string
  commodity: string; weight: string; loadType: string
  grossRate: number; dispatchMiles: number; deadheadMiles: number
  rigType: RigType; driverMode: string
  fuelEst: number; netEst: number; netRpm: number
  score: number | null; verdict: ScoreVerdict | null; marginFlag: MarginFlag | null
  driverNotes: string; brief: string | null
  generatedAt: string
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties  = { width:'100%', padding:'.75rem 1rem', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface-2)', outline:'none', fontSize:'var(--text-sm)' }
const lbl: React.CSSProperties  = { display:'block', fontSize:'.7rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', fontWeight:700, marginBottom:4 }
const secHdr: React.CSSProperties = { fontSize:'.68rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'.1em', color:'var(--primary)', paddingBottom:'.5rem', borderBottom:'1px solid var(--border)', marginBottom:'.75rem', marginTop:'.25rem' }
const toggle = (on: boolean): React.CSSProperties => ({
  padding: '.45rem .9rem', borderRadius: 8, fontWeight: 700, fontSize: '.72rem', cursor: 'pointer',
  background: on ? 'rgba(0,232,176,.12)' : 'var(--surface-2)',
  border: `1px solid ${on ? 'rgba(0,232,176,.3)' : 'var(--border)'}`,
  color: on ? 'var(--primary)' : 'var(--muted)',
})

// ── Main component ────────────────────────────────────────────────────────────
export default function Loads() {
  const [loads,        setLoads]        = useState<ExtendedLoad[]>([])
  const [loading,      setLoading]      = useState(true)
  const [form,         setForm]         = useState<F>(BLANK)
  const [panelOpen,    setPanelOpen]    = useState(false)
  const [panelTab,     setPanelTab]     = useState<'load'|'score'|'brief'>('load')
  const [editId,       setEditId]       = useState<string | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ExtendedLoad | null>(null)
  const [hos,          setHos]          = useState<HOSData | null>(null)
  // AI parse
  const [pasteText,    setPasteText]    = useState('')
  const [aiParsing,    setAiParsing]    = useState(false)
  const [aiMsg,        setAiMsg]        = useState<string | null>(null)
  // Dispatch brief
  const [briefLoading, setBriefLoading] = useState(false)
  const [brief,        setBrief]        = useState<string | null>(null)
  const [briefCopied,  setBriefCopied]  = useState(false)
  const [briefErr,     setBriefErr]     = useState<string | null>(null)
  const [saveErr,      setSaveErr]      = useState<string | null>(null)
  const [packet,       setPacket]       = useState<DriverPacket | null>(null)
  const [packetCopied, setPacketCopied] = useState(false)
  const [packetCopyErr,setPacketCopyErr]= useState(false)

  // Load data
  useEffect(() => {
    try { const h = localStorage.getItem('3b-hos-data'); if (h) setHos(JSON.parse(h)) } catch {}
    if (!supabase) { setLoads(SAMPLE_LOADS.map(l => ({ ...l } as ExtendedLoad))); setLoading(false); return }
    supabase.from('loads').select('*').order('date', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setLoads(data.map(fromDB))
        setLoading(false)
      })
  }, [])

  // Auto-detect fuel price from origin state
  useEffect(() => {
    if (form.origin && !editId) {
      const price = getDieselPrice(form.origin)
      setForm(f => ({ ...f, fuelPrice: price.toFixed(2) }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.origin])

  // Auto-set MPG when rig type changes
  useEffect(() => {
    const mpg = getMpgDefault(form.rigType)
    // Only auto-update if MPG hasn't been manually changed (matches a default)
    if ([7.5, 12.0].includes(parseFloat(form.cpmRate) || 0)) {
      // cpmRate is different from mpg — don't overwrite cpmRate
    }
    // We store mpg in the form via cpmRate? No — cpmRate is CPM, not MPG.
    // MPG is implicit from rigType. We don't need a separate field.
    void mpg // used in scoreResult below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.rigType])

  const set = (k: keyof F, v: string | boolean | number) => setForm(f => ({ ...f, [k]: v }))
  const n   = (k: keyof F) => Number(form[k]) || 0

  // ── Live score computation ────────────────────────────────────────────────
  const scoreResult = useMemo(() => {
    const miles = n('dispatchMiles')
    const dh    = n('deadheadMiles')
    const gr    = n('grossRate')
    if (!miles && !gr) return null
    return scoreLoad({
      loadedMiles:         miles,
      deadheadMiles:       dh,
      loadType:            form.loadType,
      waitHours:           n('waitHours'),
      reloadKnown:         form.reloadKnown,
      reloadAreaStrength:  form.reloadAreaStrength,
      hasOvernightParking: form.hasOvernightParking,
      grossRate:           gr,
      mpg:                 getMpgDefault(form.rigType),
      fuelPrice:           parseFloat(form.fuelPrice) || 3.85,
      rigType:             form.rigType,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.dispatchMiles, form.deadheadMiles, form.loadType, form.waitHours,
      form.reloadKnown, form.reloadAreaStrength, form.hasOvernightParking,
      form.grossRate, form.rigType, form.fuelPrice])

  // ── Fuel intelligence ────────────────────────────────────────────────────
  const fuelIntelResult = useMemo(() => {
    const miles = n('dispatchMiles')
    const dh    = n('deadheadMiles')
    if (!miles && !dh) return null
    return fuelIntel({
      origin:        form.origin,
      destination:   form.destination,
      loadedMiles:   miles,
      deadheadMiles: dh,
      rigType:       form.rigType,
      mpg:           getMpgDefault(form.rigType),
      fuelPrice:     parseFloat(form.fuelPrice) || undefined,
      grossRate:     n('grossRate') || undefined,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.origin, form.destination, form.dispatchMiles, form.deadheadMiles,
      form.rigType, form.fuelPrice, form.grossRate])

  // ── Panel handlers ────────────────────────────────────────────────────────
  function openAdd() {
    const cfg = loadSettings()
    setForm({ ...BLANK, dispatcher: cfg.dispatcher || BLANK.dispatcher, cpmRate: cfg.defaultCpm.toString() })
    setEditId(null); setBrief(null); setBriefErr(null); setPacket(null); setPanelTab('load'); setPanelOpen(true)
  }
  function openEdit(l: ExtendedLoad) {
    setForm(toForm(l)); setEditId(l.id); setBrief(null); setBriefErr(null); setPacket(null); setPanelTab('load'); setPanelOpen(true)
  }
  function closePanel() { setPanelOpen(false); setEditId(null); setForm(BLANK); setSaveErr(null); setPacket(null) }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)

    // Write latest load to localStorage so dashboard Active Mission can read it
    const latestSnap = {
      id: editId || Math.random().toString(36).slice(2),
      loadNumber: form.loadNumber, broker: form.broker,
      origin: form.origin, destination: form.destination,
      date: form.date, dispatchMiles: parseFloat(form.dispatchMiles) || 0,
      deadheadMiles: parseFloat(form.deadheadMiles) || 0,
      grossRate: parseFloat(form.grossRate) || 0,
      fuelPrice: parseFloat(form.fuelPrice) || 3.85,
      rigType: form.rigType, waitHours: parseFloat(form.waitHours) || 0,
      reloadKnown: form.reloadKnown, reloadAreaStrength: form.reloadAreaStrength,
      hasOvernightParking: form.hasOvernightParking, loadType: form.loadType,
      pickup: form.pickup, delivery: form.delivery, commodity: form.commodity,
    }
    try { localStorage.setItem('3b-latest-load', JSON.stringify(latestSnap)) } catch { /* ignore */ }

    if (!supabase) {
      if (editId) {
        setLoads(ls => ls.map(l => l.id === editId ? { ...l, ...toForm(l), ...fromDB({ ...toDB(form), id: editId, created_at: l.createdAt, updated_at: new Date().toISOString() }) } : l))
      } else {
        const id = Math.random().toString(36).slice(2)
        setLoads(ls => [fromDB({ ...toDB(form), id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }), ...ls])
      }
      setSaving(false); closePanel(); return
    }
    if (editId) {
      const { data, error } = await supabase.from('loads').update(toDB(form)).eq('id', editId).select().single()
      if (error) { setSaveErr(error.message || 'Update failed — try again.'); setSaving(false); return }
      if (data) setLoads(ls => ls.map(l => l.id === editId ? fromDB(data) : l))
    } else {
      const { data, error } = await supabase.from('loads').insert(toDB(form)).select().single()
      if (error) { setSaveErr(error.message || 'Save failed — try again.'); setSaving(false); return }
      if (data) setLoads(ls => [fromDB(data), ...ls])
    }
    setSaving(false); closePanel()
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(load: ExtendedLoad) {
    if (!supabase) { setLoads(ls => ls.filter(l => l.id !== load.id)); setDeleteTarget(null); return }
    const { error } = await supabase.from('loads').delete().eq('id', load.id)
    if (!error) setLoads(ls => ls.filter(l => l.id !== load.id))
    setDeleteTarget(null)
  }

  // ── AI Parse ──────────────────────────────────────────────────────────────
  async function handleAIParse() {
    if (!pasteText.trim()) return
    setAiParsing(true); setAiMsg(null)
    try {
      const hosData = hos ? {
        driveHoursRemaining: hos.driveRemainingHrs,
        shiftHoursRemaining: hos.shiftRemainingHrs,
        cycleHoursRemaining: hos.cycleRemainingHrs,
      } : {}
      const res  = await fetch('/api/load-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loadText: pasteText, ...hosData }),
      })
      const data = await res.json()
      if (data.parsed) {
        const p = data.parsed
        setForm(f => ({
          ...f,
          loadNumber:    p.loadNum    || f.loadNumber,
          broker:        p.broker     || f.broker,
          origin:        p.origin     || f.origin,
          destination:   p.dest       || f.destination,
          dispatchMiles: p.miles      ? String(p.miles)    : f.dispatchMiles,
          deadheadMiles: p.deadhead   ? String(p.deadhead) : f.deadheadMiles,
          grossRate:     p.totalPay   ? String(p.totalPay) : f.grossRate,
          commodity:     p.commodity  || f.commodity,
          weight:        p.weight     ? String(p.weight)   : f.weight,
        }))
        setAiMsg(`✅ Parsed: ${[p.origin, p.dest, p.broker].filter(Boolean).join(' · ')}`)
      } else {
        setAiMsg('⚠️ Could not parse — try pasting the full rate confirmation text.')
      }
    } catch {
      setAiMsg('❌ Parse failed — check API key.')
    }
    setAiParsing(false)
  }

  // ── Dispatch Brief ────────────────────────────────────────────────────────
  async function handleBrief() {
    setBriefLoading(true); setBrief(null); setBriefErr(null); setPanelTab('brief')
    try {
      const s = scoreResult
      const res = await fetch('/api/dispatch-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loadRef: form.loadNumber, broker: form.broker,
          origin: form.origin, destination: form.destination,
          pickup: form.pickup, delivery: form.delivery,
          commodity: form.commodity, weight: form.weight,
          loadType: form.loadType, grossRate: n('grossRate'),
          loadedMiles: n('dispatchMiles'), deadheadMiles: n('deadheadMiles'),
          rigType: form.rigType, driverMode: form.driverMode,
          mpg: getMpgDefault(form.rigType),
          fuelPrice: parseFloat(form.fuelPrice) || 3.85,
          grossRpm: s?.grossRpm ?? 0, netRpm: s?.netRpm ?? 0,
          marginFlag: s?.marginFlag ?? null,
          score: s?.score ?? null, verdict: s?.verdict ?? null,
          waitHours: n('waitHours'), reloadKnown: form.reloadKnown,
          reloadAreaStrength: form.reloadAreaStrength, notes: form.notes,
          driveHoursRemaining:  hos?.driveRemainingHrs,
          shiftHoursRemaining:  hos?.shiftRemainingHrs,
          cycleHoursRemaining:  hos?.cycleRemainingHrs,
        }),
      })
      const data = await res.json()
      if (data.brief) setBrief(data.brief)
      else setBriefErr(data.error || 'Brief generation failed.')
    } catch {
      setBriefErr('Network error — check your connection and API key.')
    }
    setBriefLoading(false)
  }

  // ── Copy brief to clipboard ───────────────────────────────────────────────
  async function copyBrief() {
    if (!brief) return
    try {
      await navigator.clipboard.writeText(brief)
      setBriefCopied(true)
      setTimeout(() => setBriefCopied(false), 2000)
    } catch {
      // Clipboard API unavailable (non-HTTPS dev, browser restriction)
      // Show failure state so user knows the copy didn't work
      setBriefCopied(false)
    }
  }

  // ── Driver Packet ─────────────────────────────────────────────────────────
  function buildPacket(): DriverPacket {
    const s = scoreResult
    return {
      loadNumber:    form.loadNumber    || '—',
      broker:        form.broker        || '—',
      date:          form.date,
      origin:        form.origin        || '—',
      destination:   form.destination   || '—',
      pickup:        form.pickup,
      delivery:      form.delivery,
      commodity:     form.commodity     || '—',
      weight:        form.weight,
      loadType:      form.loadType,
      grossRate:     parseFloat(form.grossRate)     || 0,
      dispatchMiles: parseFloat(form.dispatchMiles) || 0,
      deadheadMiles: parseFloat(form.deadheadMiles) || 0,
      rigType:       form.rigType,
      driverMode:    form.driverMode,
      fuelEst:       s?.fuelCost   ?? 0,
      netEst:        s?.netMargin  ?? 0,
      netRpm:        s?.netRpm     ?? 0,
      score:         s?.score      ?? null,
      verdict:       s?.verdict    ?? null,
      marginFlag:    s?.marginFlag ?? null,
      driverNotes:   form.notes,
      brief,
      generatedAt:   new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' }),
    }
  }

  function generatePacketHTML(p: DriverPacket): string {
    const h   = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    const vc  = p.verdict    === 'TAKE'    ? '#16a34a' : p.verdict    === 'AVOID'    ? '#dc2626' : '#d97706'
    const mc  = p.marginFlag === 'STRONG'  ? '#16a34a' : p.marginFlag === 'OK'       ? '#0891b2' : p.marginFlag === 'MARGINAL' ? '#d97706' : '#dc2626'
    const cur = (n: number) => n.toLocaleString('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 })
    const rig = p.rigType === 'hotshot' ? 'Hotshot Dually' : p.rigType === 'semi-team' ? 'Class 8 Semi (Team)' : 'Class 8 Semi (Solo)'
    const pFmt = (dt: string) => { try { return dt ? new Date(dt).toLocaleString('en-US',{dateStyle:'short',timeStyle:'short'}) : '—' } catch { return '—' } }
    const vBadge = p.verdict    === 'TAKE' ? 'badge-take' : p.verdict    === 'AVOID' ? 'badge-avoid' : 'badge-caution'
    const mBadge = p.marginFlag === 'STRONG' ? 'badge-strong' : p.marginFlag === 'OK' ? 'badge-ok' : p.marginFlag === 'MARGINAL' ? 'badge-marginal' : 'badge-reject'
    const wl = '<div class="wl"></div>'
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Driver Packet — ${h(p.loadNumber)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;font-size:10.5pt;color:#0f172a;background:#fff}
.page{max-width:760px;margin:0 auto;padding:1.5rem 2rem}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:.7rem;margin-bottom:.9rem}
.hdr-tag{font-size:8pt;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#64748b}
.hdr-num{font-size:18pt;font-weight:900;line-height:1.1}
.hdr-brand{font-size:8pt;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#64748b;text-align:right}
.hdr-dt{font-size:8.5pt;color:#475569;margin-top:2px;text-align:right}
.banner{background:#0f172a;color:#fff;padding:.6rem 1rem;border-radius:7px;margin-bottom:.9rem;display:flex;align-items:center;gap:.85rem;flex-wrap:wrap}
.ban-city{font-weight:900;font-size:13pt}
.ban-arr{color:#00e8b0;font-weight:900;font-size:14pt}
.ban-broker{font-size:8pt;color:#94a3b8;margin-left:auto}
.sec{margin-bottom:.9rem}
.sec-title{font-size:7.5pt;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:3px;margin-bottom:.45rem}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:.3rem .7rem}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.3rem .7rem}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:.3rem .45rem}
.f{display:flex;flex-direction:column}
.fl{font-size:7pt;text-transform:uppercase;letter-spacing:.07em;font-weight:700;color:#94a3b8}
.fv{font-weight:700;font-size:10pt;color:#0f172a;line-height:1.3}
.fin{border:1.5px solid #e2e8f0;border-radius:7px;padding:.5rem .65rem;text-align:center}
.fin-val{font-size:13pt;font-weight:900;font-variant-numeric:tabular-nums;line-height:1.2}
.score-row{display:flex;align-items:center;gap:1rem;padding:.6rem .9rem;border-radius:7px;border:1.5px solid #e2e8f0}
.score-n{font-size:26pt;font-weight:900;line-height:1;font-variant-numeric:tabular-nums}
.score-d{font-size:11pt;color:#94a3b8;font-weight:600}
.badges{display:flex;flex-direction:column;gap:5px}
.badge{display:inline-flex;padding:.2rem .55rem;border-radius:5px;font-weight:900;font-size:8pt;letter-spacing:.07em}
.badge-take{background:#dcfce7;color:#15803d;border:1px solid #86efac}
.badge-caution{background:#fef9c3;color:#a16207;border:1px solid #fde047}
.badge-avoid{background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5}
.badge-strong{background:#dcfce7;color:#15803d;border:1px solid #86efac}
.badge-ok{background:#e0f2fe;color:#0369a1;border:1px solid #7dd3fc}
.badge-marginal{background:#fef9c3;color:#a16207;border:1px solid #fde047}
.badge-reject{background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5}
.brief-pre{font-family:'Courier New',Courier,monospace;font-size:8pt;line-height:1.75;white-space:pre-wrap;word-break:break-word;padding:.7rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px}
.notes-pre{font-size:9.5pt;color:#475569;line-height:1.8;white-space:pre-wrap;padding:.5rem .7rem;border:1px dashed #cbd5e1;border-radius:6px;min-height:48px}
.wl{border-bottom:1px solid #d1d5db;height:24px;margin-bottom:2px}
.wlines{padding:.4rem .25rem}
.footer{border-top:1.5px solid #0f172a;padding-top:.5rem;margin-top:.9rem;display:flex;justify-content:space-between;align-items:center}
.ft-brand{font-size:8pt;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#64748b}
.ft-ts{font-size:8pt;color:#94a3b8}
@media print{
  body{print-color-adjust:exact;-webkit-print-color-adjust:exact}
  .page{padding:.5rem .75rem;max-width:100%}
  .banner{background:#0f172a!important;-webkit-print-color-adjust:exact!important}
  @page{margin:.45in;size:letter portrait}
}
</style>
</head>
<body>
<div class="page">

<div class="hdr">
  <div>
    <div class="hdr-tag">Driver Packet</div>
    <div class="hdr-num">Load #${h(p.loadNumber)}</div>
  </div>
  <div>
    <div class="hdr-brand">3B Fleet Commander</div>
    <div class="hdr-dt">${h(p.date)}</div>
    <div class="hdr-dt">Generated ${h(p.generatedAt)}</div>
  </div>
</div>

<div class="banner">
  <span class="ban-city">${h(p.origin.split(',')[0])}</span>
  <span class="ban-arr">→</span>
  <span class="ban-city">${h(p.destination.split(',')[0])}</span>
  ${p.broker !== '—' ? `<span class="ban-broker">${h(p.broker)}</span>` : ''}
</div>

<div class="sec">
  <div class="sec-title">Load Identity</div>
  <div class="g3">
    <div class="f"><span class="fl">Origin</span><span class="fv">${h(p.origin)}</span></div>
    <div class="f"><span class="fl">Pickup Appt</span><span class="fv">${h(pFmt(p.pickup))}</span></div>
    <div class="f"><span class="fl">Broker</span><span class="fv">${h(p.broker)}</span></div>
    <div class="f"><span class="fl">Destination</span><span class="fv">${h(p.destination)}</span></div>
    <div class="f"><span class="fl">Delivery Appt</span><span class="fv">${h(pFmt(p.delivery))}</span></div>
    <div class="f"><span class="fl">Rig / Driver</span><span class="fv">${h(rig)} · ${h(p.driverMode)}</span></div>
  </div>
</div>

<div class="sec">
  <div class="sec-title">Cargo</div>
  <div class="g3">
    <div class="f"><span class="fl">Commodity</span><span class="fv">${h(p.commodity)}</span></div>
    <div class="f"><span class="fl">Weight</span><span class="fv">${p.weight ? h(p.weight) + ' lbs' : '—'}</span></div>
    <div class="f"><span class="fl">Load Type</span><span class="fv">${h(p.loadType)}</span></div>
  </div>
</div>

<div class="sec">
  <div class="sec-title">Financials</div>
  <div class="g4" style="margin-bottom:.45rem">
    <div class="fin"><div class="fl" style="margin-bottom:2px">Gross Rate</div><div class="fin-val">${h(cur(p.grossRate))}</div></div>
    <div class="fin"><div class="fl" style="margin-bottom:2px">Net RPM</div><div class="fin-val" style="color:${mc}">$${p.netRpm.toFixed(2)}</div></div>
    <div class="fin"><div class="fl" style="margin-bottom:2px">Fuel Est</div><div class="fin-val" style="color:#d97706">${h(cur(p.fuelEst))}</div></div>
    <div class="fin"><div class="fl" style="margin-bottom:2px">Net Est</div><div class="fin-val" style="color:${p.netEst >= 0 ? '#16a34a' : '#dc2626'}">${h(cur(p.netEst))}</div></div>
  </div>
  <div style="display:flex;gap:1.5rem">
    <div class="f"><span class="fl">Loaded Miles</span><span class="fv">${fmt(p.dispatchMiles)} mi</span></div>
    <div class="f"><span class="fl">Deadhead</span><span class="fv">${fmt(p.deadheadMiles)} mi</span></div>
    <div class="f"><span class="fl">Total Miles</span><span class="fv">${fmt(p.dispatchMiles + p.deadheadMiles)} mi</span></div>
  </div>
</div>

${p.score !== null ? `<div class="sec">
  <div class="sec-title">Score Analysis</div>
  <div class="score-row">
    <div>
      <div class="fl" style="margin-bottom:3px">Load Score</div>
      <span class="score-n" style="color:${vc}">${p.score}</span><span class="score-d">/12</span>
    </div>
    <div class="badges">
      ${p.verdict    ? `<span class="badge ${vBadge}">${p.verdict}</span>`    : ''}
      ${p.marginFlag ? `<span class="badge ${mBadge}">${p.marginFlag}</span>` : ''}
    </div>
  </div>
</div>` : ''}

${p.brief ? `<div class="sec">
  <div class="sec-title">AI Dispatch Brief — 3B Fleet Commander</div>
  <div class="brief-pre">${h(p.brief)}</div>
</div>` : ''}

<div class="sec">
  <div class="sec-title">Driver Notes</div>
  ${p.driverNotes
    ? `<div class="notes-pre">${h(p.driverNotes)}</div>`
    : `<div class="wlines">${wl.repeat(3)}</div>`}
</div>

<div class="sec">
  <div class="sec-title">Dispatch Notes</div>
  <div class="wlines">${wl.repeat(4)}</div>
</div>

<div class="footer">
  <div class="ft-brand">3B Fleet Commander · Driver Packet</div>
  <div class="ft-ts">Generated ${h(p.generatedAt)}</div>
</div>

</div>
</body>
</html>`
  }

  function generatePacketText(p: DriverPacket): string {
    const SEP = '═'.repeat(50)
    const sec = (title: string) => '─── ' + title + ' ' + '─'.repeat(Math.max(2, 45 - title.length))
    const f   = (label: string, value: string) => `  ${(label + ':').padEnd(15)} ${value}`
    const cur = (n: number) => n !== 0 ? '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '$0'
    const rig = p.rigType === 'hotshot' ? 'Hotshot Dually' : p.rigType === 'semi-team' ? 'Class 8 Semi (Team)' : 'Class 8 Semi (Solo)'
    const pFmt = (dt: string) => { try { return dt ? new Date(dt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : '—' } catch { return '—' } }

    const out: string[] = [
      SEP,
      '  3B FLEET COMMANDER — DRIVER PACKET',
      `  Load #${p.loadNumber}   ${p.date}`,
      `  Generated: ${p.generatedAt}`,
      SEP,
      '',
      `ROUTE:  ${p.origin.split(',')[0]}  →  ${p.destination.split(',')[0]}`,
      ...(p.broker !== '—' ? [`BROKER: ${p.broker}`] : []),
      '',
      sec('LOAD IDENTITY'),
      f('Origin',      p.origin),
      f('Destination', p.destination),
      f('Pickup Appt', pFmt(p.pickup)),
      f('Delivery',    pFmt(p.delivery)),
      f('Broker',      p.broker),
      f('Rig',         `${rig} · ${p.driverMode}`),
      '',
      sec('CARGO'),
      f('Commodity',   p.commodity),
      f('Weight',      p.weight ? `${p.weight} lbs` : '—'),
      f('Load Type',   p.loadType),
      '',
      sec('FINANCIALS'),
      f('Gross Rate',   cur(p.grossRate)),
      f('Net RPM',      p.netRpm > 0 ? `$${p.netRpm.toFixed(2)}/mi` : '—'),
      f('Fuel Est',     cur(p.fuelEst)),
      f('Net Est',      `${p.netEst < 0 ? '-' : ''}${cur(p.netEst)}`),
      f('Loaded Miles', `${fmt(p.dispatchMiles)} mi`),
      f('Deadhead',     `${fmt(p.deadheadMiles)} mi`),
      f('Total Miles',  `${fmt(p.dispatchMiles + p.deadheadMiles)} mi`),
    ]

    if (p.score !== null) {
      out.push('', sec('SCORE ANALYSIS'))
      out.push(`  Score: ${p.score}/12   Verdict: ${p.verdict ?? '—'}   Margin: ${p.marginFlag ?? '—'}`)
    }

    if (p.brief) {
      out.push('', sec('AI DISPATCH BRIEF'))
      out.push(p.brief)
    }

    out.push('', sec('DRIVER NOTES'))
    out.push(p.driverNotes ? `  ${p.driverNotes}` : '  (none)')
    out.push('', sec('DISPATCH NOTES'))
    out.push('', '')
    out.push(SEP)
    out.push(`  Generated: ${p.generatedAt}`)
    out.push('  3B Fleet Commander — Driver Packet')
    out.push(SEP)

    return out.join('\n')
  }

  async function copyPacketText() {
    if (!packet) return
    const text = generatePacketText(packet)
    try {
      await navigator.clipboard.writeText(text)
      setPacketCopied(true);  setPacketCopyErr(false)
      setTimeout(() => setPacketCopied(false), 2500)
    } catch {
      // Clipboard API blocked (non-HTTPS, permissions) — show failure state
      setPacketCopyErr(true); setPacketCopied(false)
      setTimeout(() => setPacketCopyErr(false), 3000)
    }
  }

  function printPacket() {
    if (!packet) return
    const html = generatePacketHTML(packet)
    const win  = window.open('', '_blank')
    if (!win) { alert('Allow pop-ups to open the Driver Packet, then try again.'); return }
    win.document.write(html)
    win.document.close()
    win.focus()
    // Brief delay so styles finish parsing before the print dialog opens
    setTimeout(() => win.print(), 450)
  }

  // ── KPI metrics ───────────────────────────────────────────────────────────
  const totalLoads  = loads.length
  const totalMi     = loads.reduce((a, l) => a + (l.dispatchMiles || 0), 0)
  const bestRpm     = loads.reduce((best, l) => {
    const gr = Number(l.grossRate) || 0; const mi = l.dispatchMiles || 0; const dh = l.deadheadMiles || 0
    const rpm = (mi + dh) > 0 ? gr / (mi + dh) : 0
    return rpm > best ? rpm : best
  }, 0)
  const totalFuel   = loads.reduce((a, l) => a + (l.fuelCost || 0), 0)

  // ── Field helper ──────────────────────────────────────────────────────────
  // Always renders type="text" to avoid browser "invalid" validation popups and
  // the React controlled-input focus-loss bug where type="number" returns "" for
  // intermediate values like "3." causing a re-render that steals focus.
  const fi = (k: keyof F, label: string, type = 'text', ph?: string, req?: boolean) => {
    const isNumeric = type === 'number'
    return (
      <div key={k}>
        <label style={lbl}>{label}{req && <span style={{ color:'var(--error)', marginLeft:2 }}>*</span>}</label>
        <input value={String(form[k])} onChange={e => set(k, e.target.value)}
          type="text" inputMode={isNumeric ? 'decimal' : 'text'}
          placeholder={ph} required={req} style={inp} />
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <TopBar title="Load Intake" module="mis"
        subtitle={loading ? 'Loading…' : `${totalLoads} loads · ${fmt(totalMi)} mi`} />

      <main style={{ padding:'1.2rem', display:'grid', gap:'1.2rem' }}>

        {/* ── KPI strip ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(min(160px,100%),1fr))', gap:'.75rem' }}>
          <KpiCard label="Total loads"  value={String(totalLoads)} />
          <KpiCard label="Total miles"  value={fmt(totalMi)} />
          <KpiCard label="Best net RPM" value={bestRpm > 0 ? fmtR(bestRpm) : '—'} color="primary" />
          <KpiCard label="Total fuel"   value={fmtM(totalFuel)} color={totalFuel > 0 ? 'warn' : undefined} />
        </div>

        {/* ── Action bar ── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
          <h2 style={{ fontSize:'var(--text-lg)', fontWeight:800 }}>Load History</h2>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => exportCSV(loads)}
              style={{ padding:'.65rem 1rem', borderRadius:10, background:'var(--surface-off)', border:'1px solid var(--border)', fontWeight:600, fontSize:'var(--text-xs)' }}>
              Export CSV
            </button>
            <button onClick={openAdd}
              style={{ padding:'.65rem 1.2rem', borderRadius:10, background:'var(--primary)', color:'#061210', fontWeight:800, fontSize:'var(--text-sm)' }}>
              ⚡ New Load
            </button>
          </div>
        </div>

        {/* ── Load history table ── */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, overflow:'auto', boxShadow:'var(--shadow-sm)' }}>
          {loading
            ? <div style={{ padding:'3rem', textAlign:'center', color:'var(--muted)', fontSize:'var(--text-sm)' }}>Loading loads…</div>
            : loads.length === 0
              ? <div style={{ padding:'3rem', textAlign:'center', color:'var(--muted)', fontSize:'var(--text-sm)' }}>No loads yet — tap ⚡ New Load to add one.</div>
              : (
                <table>
                  <thead>
                    <tr>{['Date','Ref #','Broker','Route','Mi','DH','Rate','Net RPM','Wait','Score','Margin',''].map(h => (
                      <th key={h} style={{ padding:'.75rem 1rem', fontWeight:700, fontSize:'.65rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', whiteSpace:'nowrap', borderBottom:'1px solid var(--border)', textAlign:'left' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>{loads.map(l => {
                    const gr  = Number(l.grossRate) || 0
                    const mi  = l.dispatchMiles || 0
                    const dh  = l.deadheadMiles || 0
                    const fp  = parseFloat(l.fuelPrice || '3.85') || 3.85
                    const mpg = getMpgDefault(l.rigType || 'semi-solo')
                    const fc  = ((mi + dh) / mpg) * fp
                    const rpm = (mi + dh) > 0 ? gr / (mi + dh) : 0
                    const rig = l.rigType || 'semi-solo'
                    const mFlag: MarginFlag | null = gr > 0 && rpm > 0
                      ? rpm > (rig === 'hotshot' ? 2.50 : 2.00) ? 'STRONG'
                      : rpm >= (rig === 'hotshot' ? 2.00 : 1.50) ? 'OK'
                      : rpm >= (rig === 'hotshot' ? 1.50 : 1.20) ? 'MARGINAL' : 'REJECT'
                      : null
                    return (
                      <tr key={l.id} onClick={() => openEdit(l)}
                        style={{ borderBottom:'1px solid var(--border)', cursor:'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background='var(--surface-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background='')}>
                        <td style={{ padding:'.75rem 1rem', fontSize:'.7rem', color:'var(--muted)', whiteSpace:'nowrap' }}>{l.date}</td>
                        <td style={{ padding:'.75rem 1rem', fontWeight:700, fontSize:'var(--text-xs)', whiteSpace:'nowrap' }}>{l.loadNumber}</td>
                        <td style={{ padding:'.75rem 1rem', fontSize:'var(--text-xs)', color:'var(--muted)' }}>{l.broker || '—'}</td>
                        <td style={{ padding:'.75rem 1rem', fontSize:'.7rem', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {l.origin && l.destination ? `${l.origin.split(',')[0]} → ${l.destination.split(',')[0]}` : l.origin || '—'}
                        </td>
                        <td style={{ padding:'.75rem 1rem', fontVariantNumeric:'tabular-nums', fontWeight:700, fontSize:'var(--text-xs)' }}>{fmt(mi)}</td>
                        <td style={{ padding:'.75rem 1rem', fontSize:'.7rem', color: dh > mi*.15 ? 'var(--warn)' : 'var(--muted)' }}>{dh > 0 ? fmt(dh) : '—'}</td>
                        <td style={{ padding:'.75rem 1rem', fontVariantNumeric:'tabular-nums', fontWeight:700, fontSize:'var(--text-xs)', color: gr > 0 ? 'var(--text)' : 'var(--faint)' }}>{gr > 0 ? fmtM(gr) : '—'}</td>
                        <td style={{ padding:'.75rem 1rem', fontVariantNumeric:'tabular-nums', fontWeight:800, fontSize:'var(--text-xs)', color: rpm > 0 ? (rpm >= 2 ? 'var(--success)' : rpm >= 1.5 ? 'var(--primary)' : rpm >= 1.2 ? 'var(--warn)' : 'var(--error)') : 'var(--faint)' }}>
                          {rpm > 0 ? fmtR(rpm) : '—'}
                        </td>
                        <td style={{ padding:'.75rem 1rem', fontSize:'.7rem', color:'var(--muted)' }}>{l.waitHours > 0 ? `${l.waitHours}h` : '—'}</td>
                        <td style={{ padding:'.75rem 1rem' }}>
                          <LoadBadge label={gr > 0 ? (rpm >= 2 ? 'Good' : rpm >= 1.5 ? 'OK' : 'Weak') : l.dispatchMiles >= 500 ? 'Long' : '—'} color={gr > 0 ? (rpm >= 2 ? 'success' : rpm >= 1.5 ? 'primary' : 'warn') : 'muted'} />
                        </td>
                        <td style={{ padding:'.75rem 1rem' }}>
                          {mFlag && <span style={marginStyle(mFlag)}>{mFlag}</span>}
                        </td>
                        <td style={{ padding:'.75rem 1rem' }}>
                          <button onClick={e => { e.stopPropagation(); setDeleteTarget(l) }}
                            style={{ padding:'.25rem .55rem', borderRadius:6, border:'1px solid var(--border)', color:'var(--muted)', fontSize:'.65rem' }}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              )
          }
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════════════════════
          SLIDE-OUT PANEL
      ══════════════════════════════════════════════════════════════════════ */}
      {panelOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex' }} onClick={closePanel}>
          <div style={{ flex:1, background:'rgba(0,0,0,.5)', backdropFilter:'blur(3px)' }} />
          <div onClick={e => e.stopPropagation()}
            style={{ width:'min(580px,100vw)', background:'var(--surface)', borderLeft:'1px solid var(--border)', height:'100%', overflow:'auto', display:'flex', flexDirection:'column', boxShadow:'var(--shadow-lg)' }}>

            {/* Panel header */}
            <div style={{ padding:'1.2rem 1.4rem', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <div>
                <h2 style={{ fontWeight:800, fontSize:'var(--text-lg)', lineHeight:1.1 }}>
                  {editId ? '✏️ Edit Load' : '⚡ New Load Intake'}
                </h2>
                {editId && <div style={{ fontSize:'.7rem', color:'var(--muted)', marginTop:2 }}>{form.loadNumber}</div>}
              </div>
              <button onClick={closePanel} style={{ color:'var(--muted)', fontSize:'1.1rem', padding:'.3rem' }}>✕</button>
            </div>

            {/* Panel tabs */}
            <div style={{ display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              {([['load','📋 Load','load'],['score','📊 Score','score'],['brief','⚡ Brief','brief']] as [string,string,typeof panelTab][]).map(([id,label,tab]) => (
                <button key={id} onClick={() => setPanelTab(tab)}
                  style={{ flex:1, padding:'.7rem', fontSize:'.7rem', fontWeight:800, letterSpacing:'.05em', cursor:'pointer', borderBottom: panelTab === tab ? '2px solid var(--primary)' : '2px solid transparent', color: panelTab === tab ? 'var(--primary)' : 'var(--muted)', background:'none' }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Panel body */}
            <div style={{ padding:'1.2rem 1.4rem', overflow:'auto', flex:1 }}>

              {/* ── TAB: LOAD ─────────────────────────────────────────────── */}
              {panelTab === 'load' && (
                <form onSubmit={handleSave} style={{ display:'grid', gap:'1rem' }}>

                  {/* AI Quick Parse */}
                  <div style={{ background:'rgba(0,232,176,.04)', border:'1px solid rgba(0,232,176,.15)', borderRadius:12, padding:'1rem' }}>
                    <div style={{ ...secHdr, borderColor:'rgba(0,232,176,.15)', color:'var(--primary)', marginTop:0 }}>🤖 AI Quick Parse</div>
                    <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
                      placeholder="Paste rate confirmation, load board text, or broker email here → AI extracts all fields automatically"
                      rows={3} style={{ ...inp, resize:'vertical', fontSize:'.78rem', lineHeight:1.6 }} />
                    <div style={{ display:'flex', gap:8, marginTop:8, alignItems:'center', flexWrap:'wrap' }}>
                      <button type="button" onClick={handleAIParse} disabled={aiParsing || !pasteText.trim()}
                        style={{ padding:'.5rem 1rem', borderRadius:8, background: aiParsing ? 'var(--surface-2)' : 'var(--primary)', color: aiParsing ? 'var(--muted)' : '#061210', fontWeight:800, fontSize:'.72rem', opacity: !pasteText.trim() ? .5 : 1 }}>
                        {aiParsing ? '⏳ Parsing…' : '⚡ Parse Fields'}
                      </button>
                      {aiMsg && <span style={{ fontSize:'.72rem', color: aiMsg.startsWith('✅') ? 'var(--success)' : 'var(--warn)' }}>{aiMsg}</span>}
                    </div>
                  </div>

                  {/* Core Load Info */}
                  <div style={secHdr}>📦 Load Identity</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(180px,1fr))', gap:'1rem' }}>
                    {fi('loadNumber','Load Ref #','text','e.g. TQL-229184')}
                    {fi('broker','Broker','text','e.g. TQL, Coyote')}
                    {fi('origin','Origin','text','City, ST or full address', true)}
                    {fi('destination','Destination','text','City, ST or full address', true)}
                    <div>
                      <label style={lbl}>Pickup date/time</label>
                      <input type="datetime-local" value={form.pickup} onChange={e => set('pickup', e.target.value)} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Delivery date/time</label>
                      <input type="datetime-local" value={form.delivery} onChange={e => set('delivery', e.target.value)} style={inp} />
                    </div>
                  </div>

                  {/* Cargo */}
                  <div style={secHdr}>🏗 Cargo</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(180px,1fr))', gap:'1rem' }}>
                    {fi('commodity','Commodity','text','e.g. Dry goods, Auto parts')}
                    {fi('weight','Weight (lbs)','number')}
                    <div>
                      <label style={lbl}>Load Type</label>
                      <select value={form.loadType} onChange={e => set('loadType', e.target.value)} style={inp}>
                        {LOAD_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Move Type</label>
                      <select value={form.moveType} onChange={e => set('moveType', e.target.value)} style={inp}>
                        {MOVES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Rate & Rig */}
                  <div style={secHdr}>💰 Rate & Rig</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(180px,1fr))', gap:'1rem' }}>
                    {fi('grossRate','Gross Rate ($)','number')}
                    {fi('dispatchMiles','Loaded Miles','number')}
                    {fi('deadheadMiles','Deadhead Miles','number')}
                    {fi('fuelPrice','Diesel $/gal','number')}
                  </div>
                  <div style={{ display:'grid', gap:8 }}>
                    <label style={lbl}>Rig Type</label>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {RIG_OPTS.map(r => (
                        <button key={r.id} type="button" onClick={() => set('rigType', r.id)} style={toggle(form.rigType === r.id)}>
                          {r.id === 'hotshot' ? '🛻' : '🚛'} {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:'grid', gap:8 }}>
                    <label style={lbl}>Driver Mode</label>
                    <div style={{ display:'flex', gap:8 }}>
                      {(['Solo','Team'] as const).map(m => (
                        <button key={m} type="button" onClick={() => set('driverMode', m)} style={toggle(form.driverMode === m)}>
                          {m === 'Solo' ? '👤' : '👥'} {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Scoring factors */}
                  <div style={secHdr}>🎯 Scoring Factors</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(180px,1fr))', gap:'1rem' }}>
                    {fi('waitHours','Wait Hours at Pickup','number')}
                    <div>
                      <label style={lbl}>Reload Area Strength</label>
                      <div style={{ display:'flex', gap:6, marginTop:4 }}>
                        {([1,2,3] as const).map(v => (
                          <button key={v} type="button" onClick={() => set('reloadAreaStrength', v)}
                            style={{ ...toggle(form.reloadAreaStrength === v), flex:1, justifyContent:'center' }}>
                            {v === 1 ? '😐 Weak' : v === 2 ? '🙂 OK' : '🔥 Strong'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                    <button type="button" onClick={() => set('reloadKnown', !form.reloadKnown)} style={toggle(form.reloadKnown)}>
                      {form.reloadKnown ? '✅' : '⬜'} Reload Secured
                    </button>
                    <button type="button" onClick={() => set('hasOvernightParking', !form.hasOvernightParking)} style={toggle(form.hasOvernightParking)}>
                      {form.hasOvernightParking ? '✅' : '⬜'} Overnight Parking
                    </button>
                    <button type="button" onClick={() => set('permitRequired', !form.permitRequired)} style={toggle(form.permitRequired)}>
                      {form.permitRequired ? '⚠️' : '⬜'} Permit Required
                    </button>
                  </div>

                  {/* Optional */}
                  <div style={secHdr}>📋 Settlement Fields</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(180px,1fr))', gap:'1rem' }}>
                    {fi('cpmRate','CPM Rate','number')}
                    {fi('fuelCost','Fuel Cost $','number')}
                    {fi('detentionRate','Detention Rate $/hr','number')}
                    {fi('tonuRate','TONU Rate $','number')}
                    {fi('lumperCost','Lumper Cost $','number')}
                    {fi('settlementPay','Settlement Pay $','number')}
                    {fi('actualMiles','Actual (ELD) Miles','number')}
                    {fi('paidMiles','Paid Miles','number')}
                  </div>
                  <div>
                    <label style={lbl}>Notes</label>
                    <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                      style={{ ...inp, resize:'vertical' }} />
                  </div>
                  <div>
                    <label style={lbl}>Trailer #</label>
                    <input value={form.trailer} onChange={e => set('trailer', e.target.value)} style={inp} />
                  </div>

                  {/* Save bar */}
                  {saveErr && (
                    <div style={{ padding:'.6rem .9rem', borderRadius:9, background:'rgba(232,64,0,.08)', border:'1px solid rgba(232,64,0,.2)', color:'var(--error)', fontSize:'.72rem', fontWeight:600 }}>
                      ❌ {saveErr}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:10, justifyContent:'flex-end', paddingTop:4, borderTop:'1px solid var(--border)', flexWrap:'wrap' }}>
                    {editId && (
                      <button type="button"
                        onClick={() => { closePanel(); setDeleteTarget(loads.find(l => l.id === editId) ?? null) }}
                        style={{ padding:'.75rem 1rem', borderRadius:10, background:'rgba(232,64,0,.07)', border:'1px solid rgba(232,64,0,.2)', fontWeight:700, fontSize:'var(--text-xs)', color:'var(--error)', marginRight:'auto' }}>
                        🗑 Delete
                      </button>
                    )}
                    <button type="button" onClick={() => setPanelTab('score')}
                      style={{ padding:'.75rem 1rem', borderRadius:10, background:'var(--surface-off)', border:'1px solid var(--border)', fontWeight:700, fontSize:'var(--text-xs)' }}>
                      📊 Score
                    </button>
                    <button type="button" onClick={closePanel}
                      style={{ padding:'.75rem 1rem', borderRadius:10, background:'var(--surface-off)', border:'1px solid var(--border)', fontWeight:600, fontSize:'var(--text-xs)' }}>
                      Cancel
                    </button>
                    <button type="submit" disabled={saving}
                      style={{ padding:'.75rem 1.4rem', borderRadius:10, background:'var(--primary)', color:'#061210', fontWeight:800, fontSize:'var(--text-sm)', opacity:saving?.6:1 }}>
                      {saving ? 'Saving…' : editId ? 'Update' : 'Save Load'}
                    </button>
                  </div>
                </form>
              )}

              {/* ── TAB: SCORE ────────────────────────────────────────────── */}
              {panelTab === 'score' && (
                <div style={{ display:'grid', gap:'1rem' }}>
                  {!scoreResult
                    ? (
                      <div style={{ padding:'2.5rem', textAlign:'center', color:'var(--muted)', border:'1px dashed var(--border)', borderRadius:14 }}>
                        <div style={{ fontSize:'2rem', marginBottom:8 }}>📊</div>
                        <div style={{ fontWeight:700, marginBottom:4 }}>Fill in miles + gross rate</div>
                        <div style={{ fontSize:'var(--text-xs)', color:'var(--faint)' }}>Score and margin analysis appear here automatically</div>
                      </div>
                    )
                    : (
                      <>
                        {/* Score header */}
                        <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:14, padding:'1.2rem' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
                            <div>
                              <div style={{ fontSize:'.68rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', fontWeight:700 }}>Load Score</div>
                              <div style={{ fontSize:'2.2rem', fontWeight:900, lineHeight:1, color: scoreResult.verdictColor }}>{scoreResult.score}<span style={{ fontSize:'1rem', color:'var(--muted)', fontWeight:600 }}>/12</span></div>
                            </div>
                            <div style={{ textAlign:'right', display:'grid', gap:6 }}>
                              <span style={verdictStyle(scoreResult.verdict)}>{scoreResult.verdict}</span>
                              <span style={marginStyle(scoreResult.marginFlag)}>{scoreResult.marginFlag}</span>
                            </div>
                          </div>
                          {/* Score bar */}
                          <div style={{ height:10, background:'var(--surface-off)', borderRadius:5, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${(scoreResult.score/12)*100}%`, background:scoreResult.verdictColor, borderRadius:5, transition:'width .4s ease', boxShadow:`0 0 8px ${scoreResult.verdictColor}` }} />
                          </div>
                        </div>

                        {/* Financial block */}
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(180px,1fr))', gap:8 }}>
                          {([
                            ['Gross Rate',    fmtM(n('grossRate')),           'var(--text)'],
                            ['Fuel Cost',     fmtM(scoreResult.fuelCost),     'var(--warn)'],
                            ['Net Margin',    fmtM(scoreResult.netMargin),    scoreResult.netMargin >= 0 ? 'var(--success)' : 'var(--error)'],
                            ['Net RPM',       fmtR(scoreResult.netRpm),       scoreResult.marginColor],
                            ['Gross RPM',     fmtR(scoreResult.grossRpm),     'var(--primary)'],
                            ['DH Ratio',      `${scoreResult.deadheadRatio.toFixed(1)}%`, scoreResult.highDeadhead ? 'var(--warn)' : 'var(--muted)'],
                          ] as [string,string,string][]).map(([label,value,color]) => (
                            <div key={label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'.75rem', textAlign:'center' }}>
                              <div style={{ fontSize:'.62rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:3 }}>{label}</div>
                              <div style={{ fontWeight:900, fontSize:'var(--text-sm)', color, fontVariantNumeric:'tabular-nums' }}>{value}</div>
                            </div>
                          ))}
                        </div>

                        {/* Flags */}
                        {(scoreResult.highDeadhead || scoreResult.detentionRisk || scoreResult.counterOffer) && (
                          <div style={{ display:'grid', gap:6 }}>
                            {scoreResult.highDeadhead && (
                              <div style={{ background:'rgba(245,194,0,.07)', border:'1px solid rgba(245,194,0,.2)', borderRadius:10, padding:'.75rem', fontSize:'var(--text-xs)', color:'var(--warn)' }}>
                                ⚠️ <strong>High Deadhead</strong> — {scoreResult.deadheadRatio.toFixed(1)}% of loaded miles. Factor into true RPM.
                              </div>
                            )}
                            {scoreResult.detentionRisk && (
                              <div style={{ background:'rgba(245,194,0,.07)', border:'1px solid rgba(245,194,0,.2)', borderRadius:10, padding:'.75rem', fontSize:'var(--text-xs)', color:'var(--warn)' }}>
                                ⏳ <strong>Detention Risk</strong> — {n('waitHours') > 2 ? `${n('waitHours')}h wait exceeds free-time window` : 'Live load with no wait time specified — confirm detention policy'}
                              </div>
                            )}
                            {scoreResult.counterOffer && (
                              <div style={{ background: scoreResult.marginFlag === 'REJECT' ? 'rgba(232,64,0,.07)' : 'rgba(245,194,0,.07)', border:`1px solid ${scoreResult.marginFlag === 'REJECT' ? 'rgba(232,64,0,.2)' : 'rgba(245,194,0,.2)'}`, borderRadius:10, padding:'.75rem', fontSize:'var(--text-xs)', color: scoreResult.marginFlag === 'REJECT' ? 'var(--error)' : 'var(--warn)' }}>
                                💬 <strong>Counter-Offer:</strong> {scoreResult.counterOffer}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── Fuel Intelligence ─────────────────────────── */}
                        {fuelIntelResult && fuelIntelResult.totalMiles > 0 && (
                          <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:12, padding:'.9rem', display:'grid', gap:'.6rem' }}>

                            {/* Header */}
                            <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'space-between', alignItems:'center', gap:4 }}>
                              <div style={{ fontSize:'.65rem', fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em' }}>⛽ Fuel Intelligence</div>
                              <div style={{ fontSize:'.68rem', fontWeight:700, color:'var(--primary)' }}>{fuelIntelResult.summaryLine}</div>
                            </div>

                            {/* Key metrics — auto-fit so tiles wrap on narrow panels */}
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(80px,1fr))', gap:6 }}>
                              {[
                                { label:'Est. Gallons', value:`${fuelIntelResult.gallonsNeeded} gal` },
                                { label:'Fuel Cost',    value:`$${Math.round(fuelIntelResult.fuelCostTotal)}` },
                                { label:'$/Mile (fuel)',value:`$${fuelIntelResult.costPerMile.toFixed(3)}` },
                              ].map(m => (
                                <div key={m.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'.45rem .5rem', textAlign:'center' }}>
                                  <div style={{ fontSize:'.57rem', color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em' }}>{m.label}</div>
                                  <div style={{ fontSize:'.78rem', fontWeight:800, color:'var(--text)', marginTop:2 }}>{m.value}</div>
                                </div>
                              ))}
                            </div>

                            {/* MPG + price row */}
                            <div style={{ fontSize:'.65rem', color:'var(--muted)', display:'flex', gap:10, flexWrap:'wrap', lineHeight:1.5 }}>
                              <span>MPG: <strong style={{ color:'var(--text)' }}>{fuelIntelResult.mpgUsed}</strong></span>
                              <span>·</span>
                              <span>
                                Price: <strong style={{ color:'var(--text)' }}>${fuelIntelResult.priceUsed.toFixed(2)}/gal</strong>
                                {fuelIntelResult.priceIsDefault && <span style={{ color:'var(--warn)' }}> (est. — verify)</span>}
                              </span>
                              <span>·</span>
                              <span>Reserve: <strong style={{ color:'var(--text)' }}>{fuelIntelResult.reserveGal} gal</strong></span>
                            </div>

                            {/* Fuel stops */}
                            {fuelIntelResult.stops.length > 0 && (
                              <div>
                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'.35rem', flexWrap:'wrap', gap:4 }}>
                                  <div style={{ fontSize:'.6rem', fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em' }}>Possible Stops Along Route</div>
                                  <div style={{ fontSize:'.58rem', color:'var(--muted)', fontStyle:'italic' }}>based on origin/dest states</div>
                                </div>
                                <div style={{ display:'grid', gap:'.3rem' }}>
                                  {fuelIntelResult.stops.map((s, i) => (
                                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'.4rem .5rem', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, gap:8, flexWrap:'wrap' }}>
                                      <div style={{ minWidth:0 }}>
                                        <span style={{ fontSize:'.68rem', fontWeight:700, color:'var(--primary)' }}>⛽ {s.name}</span>
                                        <span style={{ fontSize:'.6rem', color:'var(--muted)', marginLeft:6 }}>{s.corridor}</span>
                                      </div>
                                      <div style={{ fontSize:'.65rem', fontWeight:700, color:'var(--text)', flexShrink:0 }}>
                                        ~{s.estGal} gal · ~${Math.round(s.estCost)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Fuel risks */}
                            {fuelIntelResult.risks.length > 0 && (
                              <div style={{ display:'grid', gap:'.3rem' }}>
                                {fuelIntelResult.risks.map((r, i) => (
                                  <div key={i} style={{
                                    fontSize:'.65rem', padding:'.45rem .6rem', borderRadius:8,
                                    background: r.level === 'HIGH' ? 'rgba(232,64,0,.07)' : r.level === 'MODERATE' ? 'rgba(245,194,0,.07)' : 'rgba(0,232,176,.05)',
                                    border: `1px solid ${r.level === 'HIGH' ? 'rgba(232,64,0,.2)' : r.level === 'MODERATE' ? 'rgba(245,194,0,.2)' : 'rgba(0,232,176,.2)'}`,
                                    color: r.level === 'HIGH' ? 'var(--error)' : r.level === 'MODERATE' ? 'var(--warn)' : 'var(--muted)',
                                    lineHeight: 1.45,
                                  }}>
                                    {r.level === 'HIGH' ? '🔴' : r.level === 'MODERATE' ? '⚠️' : 'ℹ️'} {r.message}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* MVP disclaimer */}
                            <div style={{ fontSize:'.6rem', color:'var(--muted)', lineHeight:1.5, borderTop:'1px solid var(--border)', paddingTop:'.5rem' }}>
                              ⚠️ <em>Planning estimates only.</em> Verify route, parking, diesel price, DEF availability, and truck access before dispatch.
                            </div>
                          </div>
                        )}

                        {/* Score breakdown */}
                        <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:12, padding:'.9rem' }}>
                          <div style={{ fontSize:'.65rem', fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.6rem' }}>Score Breakdown</div>
                          <div style={{ display:'grid', gap:'.35rem' }}>
                            {scoreResult.breakdown.map((b, i) => (
                              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'.35rem .5rem', borderRadius:7, background: b.points > 0 ? 'rgba(40,192,72,.05)' : b.points < 0 ? 'rgba(232,64,0,.05)' : 'transparent' }}>
                                <div>
                                  <span style={{ fontSize:'.68rem', fontWeight:700 }}>{b.label}</span>
                                  <span style={{ fontSize:'.62rem', color:'var(--muted)', marginLeft:6 }}>{b.detail}</span>
                                </div>
                                <span style={{ fontWeight:800, fontSize:'.75rem', color: b.points > 0 ? 'var(--success)' : b.points < 0 ? 'var(--error)' : 'var(--muted)', fontVariantNumeric:'tabular-nums', flexShrink:0, marginLeft:8 }}>
                                  {b.points > 0 ? `+${b.points}` : b.points}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Generate brief CTA */}
                        <button type="button" onClick={handleBrief}
                          style={{ width:'100%', padding:'.9rem', borderRadius:12, background:'linear-gradient(135deg,rgba(0,232,176,.15),rgba(0,200,144,.1))', border:'1px solid rgba(0,232,176,.25)', color:'var(--primary)', fontWeight:800, fontSize:'var(--text-sm)' }}>
                          {briefLoading ? '⏳ Generating Brief…' : '⚡ Generate Dispatch Brief'}
                        </button>
                      </>
                    )
                  }
                </div>
              )}

              {/* ── TAB: BRIEF ────────────────────────────────────────────── */}
              {panelTab === 'brief' && (
                <div style={{ display:'grid', gap:'1rem' }}>
                  {!brief && !briefLoading && !briefErr && (
                    <div style={{ padding:'2.5rem', textAlign:'center', color:'var(--muted)', border:'1px dashed var(--border)', borderRadius:14 }}>
                      <div style={{ fontSize:'2rem', marginBottom:8 }}>⚡</div>
                      <div style={{ fontWeight:700, marginBottom:6 }}>AI Dispatch Brief</div>
                      <div style={{ fontSize:'var(--text-xs)', color:'var(--faint)', marginBottom:'1rem', lineHeight:1.6 }}>
                        Generates a complete dispatch handoff block with 4-route comparison, HOS plan, fuel stops, and risk flags.
                      </div>
                      <button type="button" onClick={handleBrief}
                        style={{ padding:'.75rem 1.4rem', borderRadius:10, background:'var(--primary)', color:'#061210', fontWeight:800, fontSize:'var(--text-sm)' }}>
                        Generate Brief
                      </button>
                    </div>
                  )}
                  {briefLoading && (
                    <div style={{ padding:'2.5rem', textAlign:'center', color:'var(--muted)' }}>
                      <div style={{ fontSize:'1.5rem', marginBottom:8 }}>⏳</div>
                      <div style={{ fontWeight:700 }}>Fleet Commander is planning the mission…</div>
                      <div style={{ fontSize:'var(--text-xs)', color:'var(--faint)', marginTop:4 }}>Route analysis · HOS compliance · Fuel stops · Risk flags</div>
                    </div>
                  )}
                  {briefErr && (
                    <div style={{ background:'rgba(232,64,0,.07)', border:'1px solid rgba(232,64,0,.2)', borderRadius:12, padding:'1rem', color:'var(--error)', fontSize:'var(--text-xs)' }}>
                      ❌ {briefErr}
                      <button onClick={() => { setBriefErr(null); setBrief(null); handleBrief() }}
                        style={{ display:'block', marginTop:8, color:'var(--muted)', fontSize:'.7rem', textDecoration:'underline', background:'none', border:'none', cursor:'pointer' }}>
                        Try again
                      </button>
                    </div>
                  )}
                  {brief && (
                    <>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div style={{ fontSize:'.7rem', color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em' }}>Dispatch Handoff Block</div>
                        <button onClick={copyBrief}
                          style={{ padding:'.4rem .9rem', borderRadius:8, background: briefCopied ? 'rgba(40,192,72,.1)' : 'var(--surface-2)', border:`1px solid ${briefCopied ? 'rgba(40,192,72,.3)' : 'var(--border)'}`, color: briefCopied ? 'var(--success)' : 'var(--text)', fontWeight:700, fontSize:'.7rem' }}>
                          {briefCopied ? '✅ Copied!' : '📋 Copy All'}
                        </button>
                      </div>
                      <pre style={{ fontFamily:'ui-monospace,monospace', fontSize:'.72rem', lineHeight:1.75, color:'var(--text)', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:12, padding:'1rem', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                        {brief}
                      </pre>
                      <button type="button" onClick={() => { setBrief(null); handleBrief() }}
                        style={{ padding:'.65rem', borderRadius:10, background:'var(--surface-off)', border:'1px solid var(--border)', fontWeight:700, fontSize:'.75rem', color:'var(--muted)' }}>
                        🔄 Regenerate Brief
                      </button>
                    </>
                  )}

                  {/* ── Driver Packet ───────────────────────────────────────── */}
                  <div style={{ borderTop:'1px solid var(--border)', paddingTop:'1rem', display:'grid', gap:'.85rem' }}>

                    {/* Section header + Build button */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8 }}>
                      <div>
                        <div style={{ fontWeight:800, fontSize:'var(--text-sm)' }}>📄 Driver Packet</div>
                        <div style={{ fontSize:'.7rem', color:'var(--muted)', marginTop:2 }}>
                          {brief
                            ? 'Includes load data · score · AI brief · driver notes'
                            : 'Load data + score — generate a brief first for full packet'}
                        </div>
                      </div>
                      <button type="button"
                        onClick={() => { setPacketCopied(false); setPacketCopyErr(false); setPacket(buildPacket()) }}
                        style={{ padding:'.6rem 1rem', borderRadius:10, background:'rgba(0,232,176,.1)', border:'1px solid rgba(0,232,176,.25)', color:'var(--primary)', fontWeight:800, fontSize:'var(--text-xs)', whiteSpace:'nowrap' }}>
                        {packet ? '🔄 Rebuild' : '📋 Build Packet'}
                      </button>
                    </div>

                    {/* Packet preview + print button — shown after build */}
                    {packet && (
                      <>
                        {/* Summary card */}
                        <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:12, padding:'.9rem 1rem', display:'grid', gap:'.55rem' }}>
                          {/* Route */}
                          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                            <span style={{ fontWeight:900, fontSize:'.9rem' }}>{packet.origin.split(',')[0]}</span>
                            <span style={{ color:'var(--primary)', fontWeight:900, fontSize:'.95rem' }}>→</span>
                            <span style={{ fontWeight:900, fontSize:'.9rem' }}>{packet.destination.split(',')[0]}</span>
                            {packet.broker !== '—' && (
                              <span style={{ fontSize:'.63rem', color:'var(--muted)', padding:'.1rem .4rem', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4 }}>
                                {packet.broker}
                              </span>
                            )}
                          </div>
                          {/* Financials row */}
                          <div style={{ display:'flex', gap:'.85rem', flexWrap:'wrap' }}>
                            {([
                              ['Gross',   packet.grossRate > 0 ? fmtM(packet.grossRate) : '—'],
                              ['Net RPM', packet.netRpm    > 0 ? fmtR(packet.netRpm)    : '—'],
                              ['Fuel',    packet.fuelEst   > 0 ? fmtM(packet.fuelEst)   : '—'],
                              ['Net Est', fmtM(packet.netEst)],
                            ] as [string,string][]).map(([lbl,val]) => (
                              <div key={lbl} style={{ display:'flex', gap:4, alignItems:'baseline' }}>
                                <span style={{ fontSize:'.6rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', fontWeight:700 }}>{lbl}</span>
                                <span style={{ fontSize:'.76rem', fontWeight:800, fontVariantNumeric:'tabular-nums' }}>{val}</span>
                              </div>
                            ))}
                          </div>
                          {/* Score + brief status */}
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                            {packet.verdict    && <span style={verdictStyle(packet.verdict)}>{packet.verdict}</span>}
                            {packet.marginFlag && <span style={marginStyle(packet.marginFlag)}>{packet.marginFlag}</span>}
                            <span style={{ fontSize:'.63rem', fontWeight:600, color: packet.brief ? 'var(--success)' : 'var(--muted)' }}>
                              {packet.brief ? '✓ AI Brief included' : '⚠ No brief — packet uses load data only'}
                            </span>
                          </div>
                          <div style={{ fontSize:'.62rem', color:'var(--faint)' }}>Built {packet.generatedAt}</div>
                        </div>

                        {/* Action row: Print + Copy Text */}
                        <div style={{ display:'flex', gap:8 }}>
                          <button type="button" onClick={printPacket}
                            style={{ flex:1, padding:'.85rem .5rem', borderRadius:12, background:'var(--primary)', color:'#061210', fontWeight:800, fontSize:'var(--text-xs)', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                            🖨️ Print / PDF
                          </button>
                          <button type="button" onClick={copyPacketText}
                            style={{ flex:1, padding:'.85rem .5rem', borderRadius:12, fontWeight:800, fontSize:'var(--text-xs)', display:'flex', alignItems:'center', justifyContent:'center', gap:6, transition:'background .15s, border-color .15s',
                              background:  packetCopied ? 'rgba(40,192,72,.12)'  : packetCopyErr ? 'rgba(232,64,0,.1)'   : 'var(--surface-2)',
                              border:     `1px solid ${packetCopied ? 'rgba(40,192,72,.3)' : packetCopyErr ? 'rgba(232,64,0,.3)' : 'var(--border)'}`,
                              color:       packetCopied ? 'var(--success)'        : packetCopyErr ? 'var(--error)'        : 'var(--text)',
                            }}>
                            {packetCopied ? '✅ Copied!' : packetCopyErr ? '❌ Copy failed' : '📋 Copy Text'}
                          </button>
                        </div>
                        <div style={{ fontSize:'.63rem', color:'var(--faint)', textAlign:'center', lineHeight:1.6 }}>
                          <strong style={{ color:'var(--muted)' }}>Print</strong> → Save as PDF &nbsp;·&nbsp;
                          <strong style={{ color:'var(--muted)' }}>Copy</strong> → paste into messages, email, or notes
                        </div>
                      </>
                    )}
                  </div>

                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteTarget && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', backdropFilter:'blur(4px)', zIndex:60, display:'grid', placeItems:'center', padding:'1rem' }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:'2rem', maxWidth:380, width:'100%', textAlign:'center' }}>
            <h3 style={{ fontWeight:800, marginBottom:'.5rem' }}>Delete this load?</h3>
            <p style={{ color:'var(--muted)', fontSize:'var(--text-xs)', marginBottom:'1.5rem', lineHeight:1.6 }}>
              Load #{deleteTarget.loadNumber} · {deleteTarget.date}<br />This cannot be undone.
            </p>
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button onClick={() => setDeleteTarget(null)}
                style={{ padding:'.75rem 1.2rem', borderRadius:10, background:'var(--surface-off)', border:'1px solid var(--border)', fontWeight:600, fontSize:'var(--text-sm)' }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteTarget)}
                style={{ padding:'.75rem 1.4rem', borderRadius:10, background:'var(--error)', color:'white', fontWeight:800, fontSize:'var(--text-sm)' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 600px) {
          table th:nth-child(n+6), table td:nth-child(n+6) { display: none; }
        }
      `}</style>
    </>
  )
}
