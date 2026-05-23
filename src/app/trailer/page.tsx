'use client'
/**
 * /trailer — Trailer + Inspection Intelligence dashboard.
 *
 * Shows:
 *  • Active trailer profile (expiry alerts, stats, damage log)
 *  • Action buttons: Pre-Trip / Tire Log / Inspection / Profile
 *  • Expiry alert banner for annual / state inspections
 *  • Recent event timeline
 *  • Trailer roster (all profiles)
 *
 * Data layer: trailerIntelligence.ts (localStorage + Supabase write-through)
 */
import { useState, useEffect, useCallback } from 'react'
import {
  getProfiles,
  getTrailerEvents,
  getLastPreTrip,
  getLastTireLog,
  getExpiryAlerts,
  saveProfile,
  analyzeTires,
  getActiveContext,
  type TrailerProfile,
  type TrailerEvent,
  type PreTripRecord,
  type TireLog,
  type InspectionExpiryAlert,
  type TrailerEventType,
} from '@/lib/trailerIntelligence'
import PreTripSheet          from '@/components/trailer/PreTripSheet'
import TireLogSheet          from '@/components/trailer/TireLogSheet'
import TrailerInspectionSheet from '@/components/trailer/TrailerInspectionSheet'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(iso?: string): string {
  if (!iso) return '—'
  const d  = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  const hrs  = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 2)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hrs  < 24) return `${hrs}h ago`
  if (days < 7)  return `${days}d ago`
  return fmtDate(iso)
}

const EVENT_TYPE_META: Record<TrailerEventType, { label: string; emoji: string; color: string }> = {
  pickup:        { label: 'Pickup',          emoji: '🔗', color: 'var(--primary)' },
  drop:          { label: 'Drop',            emoji: '📍', color: '#60c8ff' },
  empty_hook:    { label: 'Empty Hook',      emoji: '🚛', color: 'var(--warn)' },
  inspection:    { label: 'Inspection',      emoji: '🔍', color: 'var(--success)' },
  damage_found:  { label: 'Damage Found',    emoji: '⚠️', color: 'var(--error)' },
  damage_cleared:{ label: 'Damage Cleared',  emoji: '✅', color: 'var(--success)' },
  reefer_check:  { label: 'Reefer Check',    emoji: '❄️', color: '#60d4ff' },
  seal_verified: { label: 'Seal Verified',   emoji: '🔒', color: 'var(--success)' },
  fuel_added:    { label: 'Fuel Added',      emoji: '⛽', color: 'var(--warn)' },
}

const TIER_COLOR: Record<string, string> = {
  critical:     'var(--error)',
  urgent:       '#ff6b35',
  warning:      'var(--warn)',
  preventative: '#60c8ff',
  info:         'var(--muted)',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ExpiryBanner({ alert }: { alert: InspectionExpiryAlert }) {
  const color = TIER_COLOR[alert.tier]
  const label = alert.type === 'annual' ? 'Annual Inspection' : 'State Inspection'
  const msg   = alert.daysUntil < 0
    ? `Expired ${Math.abs(alert.daysUntil)}d ago`
    : alert.daysUntil === 0
      ? 'Expires TODAY'
      : `Expires in ${alert.daysUntil}d`

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: `${color}18`, border: `1.5px solid ${color}`,
      borderRadius: 12, padding: '.65rem .9rem', marginBottom: 8,
    }}>
      <span style={{ fontSize: '1.1rem' }}>
        {alert.daysUntil < 0 ? '🛑' : alert.daysUntil <= 7 ? '⚠️' : '📅'}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: '.82rem', color }}>
          🚚 {alert.trailerNumber} — {label}
        </div>
        <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 1 }}>
          {msg} · expires {fmtDate(alert.expiresAt)}
        </div>
      </div>
    </div>
  )
}

function ProfileCard({ profile, isActive, onClick }: { profile: TrailerProfile; isActive: boolean; onClick: () => void }) {
  const hasAnnual = !!profile.annualInspectionExpires
  const hasState  = !!profile.stateInspectionExpires
  const annualOk  = hasAnnual && new Date(profile.annualInspectionExpires!).getTime() > Date.now()
  const stateOk   = hasState  && new Date(profile.stateInspectionExpires!).getTime()  > Date.now()

  return (
    <button onClick={onClick} style={{
      display:       'flex', flexDirection: 'column', gap: 4,
      padding:       '.75rem .9rem', borderRadius: 14, textAlign: 'left',
      border:        `1.5px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
      background:    isActive ? 'rgba(0,232,176,.07)' : 'var(--surface-2)',
      cursor:        'pointer', width: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 900, fontSize: '.95rem' }}>🚚 {profile.trailerNumber}</div>
        {isActive && (
          <span style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--primary)', background: 'rgba(0,232,176,.15)', padding: '2px 7px', borderRadius: 20 }}>
            ACTIVE
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {profile.trailerType && (
          <span style={{ fontSize: '.68rem', color: 'var(--muted)' }}>
            {profile.trailerType.replace('_',' ')}
          </span>
        )}
        {profile.totalLoads > 0 && (
          <span style={{ fontSize: '.68rem', color: 'var(--muted)' }}>{profile.totalLoads} loads</span>
        )}
        {profile.lastUsedAt && (
          <span style={{ fontSize: '.68rem', color: 'var(--muted)' }}>used {fmtTime(profile.lastUsedAt)}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <span style={{ fontSize: '.62rem', fontWeight: 700, color: annualOk ? 'var(--success)' : hasAnnual ? 'var(--error)' : 'var(--muted)' }}>
          {annualOk ? '✅' : hasAnnual ? '❌' : '—'} Annual
        </span>
        <span style={{ fontSize: '.62rem', fontWeight: 700, color: stateOk ? 'var(--success)' : hasState ? 'var(--error)' : 'var(--muted)' }}>
          {stateOk ? '✅' : hasState ? '❌' : '—'} State
        </span>
        {profile.damageLog.length > 0 && (
          <span style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--error)' }}>
            ⚠️ {profile.damageLog.length} damage item{profile.damageLog.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  )
}

// ── Edit profile sheet ────────────────────────────────────────────────────────

function ProfileSheet({ open, initial, onClose, onSave }: {
  open: boolean
  initial?: Partial<TrailerProfile>
  onClose: () => void
  onSave: (data: Partial<TrailerProfile>) => void
}) {
  const [trailerNum, setTrailerNum] = useState('')
  const [trailerType, setTrailerType] = useState('')
  const [plate, setPlate]   = useState('')
  const [vin,   setVin]     = useState('')
  const [year,  setYear]    = useState('')
  const [make,  setMake]    = useState('')
  const [annualDate,   setAnnualDate]   = useState('')
  const [annualExpiry, setAnnualExpiry] = useState('')
  const [stateDate,    setStateDate]    = useState('')
  const [stateExpiry,  setStateExpiry]  = useState('')
  const [notes, setNotes]   = useState('')
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => {
    if (!open) return
    setTrailerNum(initial?.trailerNumber ?? '')
    setTrailerType(initial?.trailerType  ?? '')
    setPlate(initial?.plate ?? '')
    setVin(initial?.vin   ?? '')
    setYear(initial?.year ?? '')
    setMake(initial?.make ?? '')
    setAnnualDate(initial?.annualInspectionDate    ?? '')
    setAnnualExpiry(initial?.annualInspectionExpires ?? '')
    setStateDate(initial?.stateInspectionDate    ?? '')
    setStateExpiry(initial?.stateInspectionExpires ?? '')
    setNotes(initial?.conditionNotes ?? '')
    setSaved(false); setSaving(false)
  }, [open, initial])

  if (!open) return null

  async function handleSave() {
    if (!trailerNum.trim() || saving) return
    setSaving(true)
    const data: Partial<TrailerProfile> = {
      trailerNumber:            trailerNum.trim(),
      trailerType:              (trailerType as TrailerProfile['trailerType']) || undefined,
      plate:                    plate    || undefined,
      vin:                      vin      || undefined,
      year:                     year     || undefined,
      make:                     make     || undefined,
      annualInspectionDate:     annualDate   || undefined,
      annualInspectionExpires:  annualExpiry || undefined,
      stateInspectionDate:      stateDate    || undefined,
      stateInspectionExpires:   stateExpiry  || undefined,
      conditionNotes:           notes        || undefined,
    }
    await saveProfile(data as Parameters<typeof saveProfile>[0])
    setSaved(true)
    setTimeout(() => { onSave(data); onClose() }, 800)
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        maxHeight: '90dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{ padding: '.65rem 1.1rem .5rem', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>🚚 Trailer Profile</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--muted)' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Trailer # */}
          <div>
            <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Trailer Number *</div>
            <input value={trailerNum} onChange={e => setTrailerNum(e.target.value)} placeholder="e.g. 48201"
              style={{ width: '100%', padding: '.55rem .7rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.9rem', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Type + Make/Year */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Type</div>
              <select value={trailerType} onChange={e => setTrailerType(e.target.value)}
                style={{ width: '100%', padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.82rem', outline: 'none' }}>
                <option value="">—</option>
                {(['dry_van','reefer','flatbed','step_deck','tanker','other']).map(t =>
                  <option key={t} value={t}>{t.replace('_',' ')}</option>
                )}
              </select>
            </div>
            <div>
              <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Year</div>
              <input value={year} onChange={e => setYear(e.target.value)} placeholder="2020"
                style={{ width: '100%', padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Make</div>
              <input value={make} onChange={e => setMake(e.target.value)} placeholder="Wabash"
                style={{ width: '100%', padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Plate + VIN */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Plate</div>
              <input value={plate} onChange={e => setPlate(e.target.value)} placeholder="License plate"
                style={{ width: '100%', padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>VIN</div>
              <input value={vin} onChange={e => setVin(e.target.value)} placeholder="VIN"
                style={{ width: '100%', padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Inspection dates */}
          <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '.75rem .9rem' }}>
            <div style={{ fontWeight: 800, fontSize: '.82rem', marginBottom: 10 }}>📋 Inspection Records</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Annual Insp. Date</div>
                <input type="date" value={annualDate} onChange={e => setAnnualDate(e.target.value)}
                  style={{ width: '100%', padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '.82rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Annual Expiry</div>
                <input type="date" value={annualExpiry} onChange={e => setAnnualExpiry(e.target.value)}
                  style={{ width: '100%', padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '.82rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>State Insp. Date</div>
                <input type="date" value={stateDate} onChange={e => setStateDate(e.target.value)}
                  style={{ width: '100%', padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '.82rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>State Expiry</div>
                <input type="date" value={stateExpiry} onChange={e => setStateExpiry(e.target.value)}
                  style={{ width: '100%', padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '.82rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>

          {/* Condition notes */}
          <div>
            <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Condition Notes</div>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Known issues, notes…"
              style={{ width: '100%', padding: '.55rem .7rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit' }} />
          </div>
        </div>

        <div style={{ flexShrink: 0, padding: '.75rem 1.1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
          <button onClick={handleSave} disabled={!trailerNum.trim() || saving || saved} style={{
            width: '100%', padding: '1rem', borderRadius: 14, border: 'none',
            background: saved ? 'var(--success)' : 'var(--primary)',
            color: '#000', fontWeight: 900, fontSize: '1rem',
            cursor: (!trailerNum.trim() || saving || saved) ? 'default' : 'pointer',
            opacity: (saving || !trailerNum.trim()) ? .6 : 1, transition: 'all .2s',
          }}>
            {saved ? '✅ Saved' : saving ? 'Saving…' : '💾 Save Profile'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TrailerPage() {
  const [profiles,        setProfiles]        = useState<TrailerProfile[]>([])
  const [events,          setEvents]          = useState<TrailerEvent[]>([])
  const [expiryAlerts,    setExpiryAlerts]    = useState<InspectionExpiryAlert[]>([])
  const [lastPreTrip,     setLastPreTrip]     = useState<PreTripRecord | undefined>()
  const [lastTireLog,     setLastTireLog]     = useState<TireLog | undefined>()
  const [activeTrailer,   setActiveTrailer]   = useState('')
  const [activeProfile,   setActiveProfile]   = useState<TrailerProfile | undefined>()

  const [showPreTrip,      setShowPreTrip]      = useState(false)
  const [showTireLog,      setShowTireLog]      = useState(false)
  const [showInspection,   setShowInspection]   = useState(false)
  const [showProfile,      setShowProfile]      = useState(false)
  const [inspEventType,    setInspEventType]    = useState<TrailerEventType>('pickup')
  const [showAllEvents,    setShowAllEvents]    = useState(false)
  const [showAllProfiles,  setShowAllProfiles]  = useState(false)

  const load = useCallback(() => {
    const all      = getProfiles()
    const ctx      = getActiveContext()
    const active   = ctx.trailerNumber || (all[0]?.trailerNumber ?? '')
    const profile  = all.find(p => p.trailerNumber === active)

    setProfiles(all)
    setActiveTrailer(active)
    setActiveProfile(profile)
    setEvents(getTrailerEvents(active || undefined, 20))
    setExpiryAlerts(getExpiryAlerts())
    if (active) {
      setLastPreTrip(getLastPreTrip(active))
      setLastTireLog(getLastTireLog(active))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function handleSheetClose() {
    setShowPreTrip(false)
    setShowTireLog(false)
    setShowInspection(false)
    setShowProfile(false)
    load()
  }

  function openInspection(type: TrailerEventType) {
    setInspEventType(type)
    setShowInspection(true)
  }

  const tireAlerts = lastTireLog ? analyzeTires(lastTireLog) : []
  const isReefer   = activeProfile?.trailerType === 'reefer'

  // Recent events to show
  const visibleEvents = showAllEvents ? events : events.slice(0, 5)

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 120 }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(180deg,rgba(6,18,16,.98) 0%,var(--surface) 100%)',
        borderBottom: '1px solid var(--border)',
        padding: '1rem 1.1rem .85rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '-.01em' }}>
              🚚 Trailer Intel
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
              Inspections · Tires · History · Damage
            </div>
          </div>
          {/* Only show "+ Add" when no profile exists; otherwise "Edit" is inline below */}
          {profiles.length === 0 && (
            <button onClick={() => setShowProfile(true)} style={{
              padding: '.4rem .75rem', borderRadius: 20, fontSize: '.72rem', fontWeight: 700,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--muted)', cursor: 'pointer',
            }}>
              + Add Trailer
            </button>
          )}
        </div>

        {/* Active trailer — tap to edit */}
        {activeProfile && (
          <button onClick={() => setShowProfile(true)} style={{
            marginTop: 10, display: 'flex', alignItems: 'center', gap: 8,
            background: 'none', border: 'none', borderRadius: 10, padding: '.5rem 0',
            cursor: 'pointer', width: '100%', textAlign: 'left',
          }}>
            <span style={{ fontSize: '.95rem' }}>🚚</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 900, fontSize: '.9rem', color: 'var(--text)' }}>
                {activeProfile.trailerNumber}
              </span>
              {activeProfile.trailerType && (
                <span style={{ fontSize: '.7rem', color: 'var(--muted)', marginLeft: 6 }}>
                  {activeProfile.trailerType.replace('_', ' ')}
                </span>
              )}
              {activeProfile.lastLoadNumber && (
                <span style={{ fontSize: '.7rem', color: 'var(--muted)', marginLeft: 6 }}>
                  · Load #{activeProfile.lastLoadNumber}
                </span>
              )}
            </div>
            <span style={{ fontSize: '.68rem', color: 'var(--muted)' }}>Edit →</span>
          </button>
        )}

        {!activeProfile && profiles.length === 0 && (
          <p style={{ marginTop: 6, fontSize: '.75rem', color: 'var(--muted)', margin: '8px 0 0' }}>
            Tap + Add Trailer above to set up your trailer profile.
          </p>
        )}
      </div>

      <div style={{ padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Expiry alerts */}
        {expiryAlerts.length > 0 && (
          <div>
            <div style={{ fontSize: '.65rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              Inspection Expiry Alerts
            </div>
            {expiryAlerts.map((a, i) => <ExpiryBanner key={i} alert={a} />)}
          </div>
        )}

        {/* Tire alerts from last log */}
        {tireAlerts.length > 0 && (
          <div>
            <div style={{ fontSize: '.65rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              Tire Alerts
            </div>
            {tireAlerts.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: a.tier === 'critical' ? 'rgba(232,64,0,.08)' : 'rgba(245,194,0,.06)',
                border: `1.5px solid ${a.tier === 'critical' ? 'var(--error)' : 'var(--warn)'}`,
                borderRadius: 10, padding: '.55rem .8rem', marginBottom: 6,
              }}>
                <span style={{ fontSize: '.9rem' }}>{a.tier === 'critical' ? '🛑' : '⚠️'}</span>
                <div>
                  <span style={{ fontWeight: 800, fontSize: '.82rem', color: a.tier === 'critical' ? 'var(--error)' : 'var(--warn)' }}>
                    {a.label}
                  </span>
                  <span style={{ fontSize: '.75rem', color: 'var(--muted)', marginLeft: 6 }}>{a.issue}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action pills — compact horizontal row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { label: 'Pre-Trip',   emoji: '🚛', status: lastPreTrip ? fmtTime(lastPreTrip.createdAt) : null,  action: () => setShowPreTrip(true)               },
            { label: 'Tire Log',   emoji: '🔵', status: lastTireLog ? fmtTime(lastTireLog.createdAt) : null,  action: () => setShowTireLog(true)                },
            { label: 'Pickup',     emoji: '🔗', status: null,                                                   action: () => openInspection('pickup')           },
            { label: 'Drop',       emoji: '📍', status: null,                                                   action: () => openInspection('drop')             },
            { label: 'Inspect',    emoji: '🔍', status: null,                                                   action: () => openInspection('inspection')       },
            { label: 'Reefer',     emoji: '❄️', status: null,                                                   action: () => openInspection('reefer_check'), hidden: !isReefer },
          ].filter(a => !a.hidden).map(a => (
            <button key={a.label} onClick={a.action} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '.45rem .8rem', borderRadius: 20, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text)', fontWeight: 700, fontSize: '.8rem',
            }}>
              <span style={{ fontSize: '.95rem' }}>{a.emoji}</span>
              <span>{a.label}</span>
              {a.status && (
                <span style={{ fontSize: '.62rem', color: 'var(--primary)', fontWeight: 600 }}>{a.status}</span>
              )}
            </button>
          ))}
        </div>

        {/* Recent events timeline */}
        {events.length > 0 && (
          <div>
            <div style={{ fontSize: '.65rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              Recent Events
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {visibleEvents.map(ev => {
                const m = EVENT_TYPE_META[ev.eventType]
                const dmgCount = ev.damageItems.length
                return (
                  <div key={ev.id} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    background: 'var(--surface-2)', borderRadius: 12, padding: '.65rem .85rem',
                    borderLeft: `3px solid ${m.color}`,
                  }}>
                    <span style={{ fontSize: '1rem', flexShrink: 0 }}>{m.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontWeight: 800, fontSize: '.85rem', color: m.color }}>{m.label}</span>
                        <span style={{ fontSize: '.65rem', color: 'var(--muted)', flexShrink: 0 }}>{fmtTime(ev.createdAt)}</span>
                      </div>
                      <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
                        🚚 {ev.trailerNumber}
                        {ev.locationLabel && <span> · {ev.locationLabel}</span>}
                        {ev.loadNumber    && <span> · Load #{ev.loadNumber}</span>}
                        {ev.sealNumber    && <span> · Seal {ev.sealNumber}{ev.sealVerified ? ' ✓' : ''}</span>}
                      </div>
                      {dmgCount > 0 && (
                        <div style={{ fontSize: '.68rem', color: 'var(--error)', fontWeight: 700, marginTop: 2 }}>
                          ⚠️ {dmgCount} damage item{dmgCount !== 1 ? 's' : ''}
                        </div>
                      )}
                      {ev.notes && (
                        <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2, fontStyle: 'italic' }}>
                          {ev.notes}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {events.length > 5 && (
              <button onClick={() => setShowAllEvents(p => !p)} style={{
                marginTop: 8, width: '100%', padding: '.5rem', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--muted)', fontWeight: 700, fontSize: '.78rem', cursor: 'pointer',
              }}>
                {showAllEvents ? 'Show less ↑' : `Show all ${events.length} events ↓`}
              </button>
            )}
          </div>
        )}

        {/* Trailer roster */}
        {profiles.length > 0 && (
          <div>
            <div style={{ fontSize: '.65rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              Trailer Roster ({profiles.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(showAllProfiles ? profiles : profiles.slice(0, 4)).map(p => (
                <ProfileCard
                  key={p.id}
                  profile={p}
                  isActive={p.trailerNumber === activeTrailer}
                  onClick={() => {
                    setActiveTrailer(p.trailerNumber)
                    setActiveProfile(p)
                    setEvents(getTrailerEvents(p.trailerNumber, 20))
                    setLastPreTrip(getLastPreTrip(p.trailerNumber))
                    setLastTireLog(getLastTireLog(p.trailerNumber))
                  }}
                />
              ))}
            </div>
            {profiles.length > 4 && (
              <button onClick={() => setShowAllProfiles(p => !p)} style={{
                marginTop: 8, width: '100%', padding: '.5rem', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--muted)', fontWeight: 700, fontSize: '.78rem', cursor: 'pointer',
              }}>
                {showAllProfiles ? 'Show less ↑' : `+${profiles.length - 4} more trailers ↓`}
              </button>
            )}
          </div>
        )}

        {/* Empty state — minimal, no duplicate CTA */}
        {events.length === 0 && profiles.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--muted)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>🚚</div>
            <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 4 }}>No trailer data yet</div>
            <div style={{ fontSize: '.78rem' }}>Use "+ Add Trailer" in the header to get started.</div>
          </div>
        )}
      </div>

      {/* Sheets */}
      <PreTripSheet
        open={showPreTrip}
        onClose={handleSheetClose}
        trailerNumber={activeTrailer}
        isReefer={isReefer}
      />
      <TireLogSheet
        open={showTireLog}
        onClose={handleSheetClose}
        trailerNumber={activeTrailer}
      />
      <TrailerInspectionSheet
        open={showInspection}
        onClose={handleSheetClose}
        eventType={inspEventType}
        trailerNumber={activeTrailer}
        isReefer={isReefer}
      />
      <ProfileSheet
        open={showProfile}
        initial={activeProfile}
        onClose={handleSheetClose}
        onSave={load}
      />
    </div>
  )
}
