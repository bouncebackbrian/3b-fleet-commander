'use client'
/**
 * ReceiverIntelPanel — View and add operational intelligence for a location.
 * Shows approach notes, backing strategy, parking, nearby services, risk tags.
 */
import { useState, useEffect, useCallback } from 'react'
import type { ReceiverIntel, ReceiverTag } from '@/lib/dashboard/types'
import { RECEIVER_TAGS } from '@/lib/dashboard/types'

interface Props {
  open:        boolean
  onClose:     () => void
  placeName?:  string    // pre-fill from current stop/destination
  city?:       string
  state?:      string
}

const DIFFICULTY_LABELS = ['', '😊 Easy', '🙂 Simple', '😐 Moderate', '😬 Hard', '🚨 Extreme']
const NOTE_SECTIONS = [
  { key: 'approachNotes',  emoji: '🗺',  label: 'Approach'  },
  { key: 'backingNotes',   emoji: '🚛',  label: 'Backing'   },
  { key: 'parkingNotes',   emoji: '🅿️',  label: 'Parking'   },
  { key: 'overnightNotes', emoji: '🌙',  label: 'Overnight' },
  { key: 'securityNotes',  emoji: '🔒',  label: 'Security'  },
  { key: 'unloadNotes',    emoji: '📦',  label: 'Unloading' },
] as const

const TAG_GROUPS: { label: string; tags: ReceiverTag[] }[] = [
  {
    label: 'Backing',
    tags: ['easy_backing', 'tight_backing', 'blindside', 'drop_and_hook', 'live_unload'],
  },
  {
    label: 'Facility',
    tags: ['lumper_required', 'pallet_jack_needed', 'long_wait', 'fast_unload', 'after_hours_ok', 'appointment_required'],
  },
  {
    label: 'Parking',
    tags: ['overnight_parking', 'no_overnight', 'trailer_staging'],
  },
  {
    label: 'Nearby',
    tags: ['gym_nearby', 'shower_nearby', 'planet_fitness', 'fuel_nearby', 'scale_nearby', 'repair_nearby'],
  },
  {
    label: 'Hazards',
    tags: ['uneven_pavement', 'low_clearance', 'narrow_entrance', 'aggressive_security'],
  },
  {
    label: 'Vibe',
    tags: ['easy_security', 'pet_friendly', 'good_wifi', 'quiet_overnight'],
  },
]

const TAG_LABELS: Record<string, string> = {
  easy_backing: 'Easy Backing', tight_backing: 'Tight Backing', blindside: 'Blindside',
  drop_and_hook: 'Drop & Hook', live_unload: 'Live Unload', lumper_required: 'Lumper Required',
  pallet_jack_needed: 'Pallet Jack', long_wait: 'Long Wait', fast_unload: 'Fast Unload',
  after_hours_ok: 'After Hours OK', appointment_required: 'Appt Required',
  overnight_parking: 'Overnight OK', no_overnight: 'No Overnight', trailer_staging: 'Trailer Staging',
  gym_nearby: 'Gym Nearby', shower_nearby: 'Shower Nearby', planet_fitness: 'Planet Fitness',
  fuel_nearby: 'Fuel Nearby', scale_nearby: 'Scale Nearby', repair_nearby: 'Repair Nearby',
  uneven_pavement: 'Uneven Pavement', low_clearance: 'Low Clearance', narrow_entrance: 'Narrow Entry',
  aggressive_security: 'Aggressive Security', easy_security: 'Easy Security',
  pet_friendly: 'Pet Friendly', good_wifi: 'Good WiFi', quiet_overnight: 'Quiet Overnight',
}

const LS_KEY = '3b-receiver-intel'

function loadAll(): ReceiverIntel[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveAll(records: ReceiverIntel[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(records)) } catch { /* ignore */ }
}

function findByPlace(records: ReceiverIntel[], name: string): ReceiverIntel | null {
  const n = name.trim().toLowerCase()
  return records.find(r => r.placeName.toLowerCase() === n) ?? null
}

function blankRecord(placeName: string, city?: string, state?: string): ReceiverIntel {
  return {
    id: crypto.randomUUID(), placeName, city, state,
    tags: [], visitCount: 1, createdAt: new Date().toISOString(),
  }
}

export default function ReceiverIntelPanel({ open, onClose, placeName = '', city, state }: Props) {
  const [record,    setRecord]    = useState<ReceiverIntel | null>(null)
  const [editing,   setEditing]   = useState(false)
  const [draft,     setDraft]     = useState<ReceiverIntel | null>(null)
  const [placeInput, setPlaceInput] = useState(placeName)

  // Load existing record when panel opens
  useEffect(() => {
    if (!open) return
    const all  = loadAll()
    const name = placeName || placeInput
    const found = name ? findByPlace(all, name) : null
    setRecord(found)
    setEditing(!found)
    setDraft(found ?? blankRecord(name || '', city, state))
    setPlaceInput(name || '')
  }, [open, placeName, city, state]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTag = useCallback((tag: string) => {
    setDraft(prev => {
      if (!prev) return prev
      const has = prev.tags.includes(tag)
      return { ...prev, tags: has ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag] }
    })
  }, [])

  const handleSave = useCallback(() => {
    if (!draft) return
    const all     = loadAll()
    const existing = all.findIndex(r => r.id === draft.id)
    const updated  = { ...draft, updatedAt: new Date().toISOString() }
    if (existing !== -1) all[existing] = updated
    else all.push(updated)
    saveAll(all)
    setRecord(updated)
    setEditing(false)
  }, [draft])

  const handleDelete = useCallback(() => {
    if (!record) return
    const all     = loadAll().filter(r => r.id !== record.id)
    saveAll(all)
    setRecord(null)
    setDraft(blankRecord(placeInput, city, state))
    setEditing(true)
  }, [record, placeInput, city, state])

  if (!open) return null

  const display = editing ? draft : record

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 300 }} onClick={onClose} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
        background: 'var(--surface)', borderRadius: '18px 18px 0 0',
        padding: '1.5rem 1.25rem 2.5rem',
        boxShadow: '0 -4px 30px rgba(0,0,0,.35)',
        maxHeight: '92vh', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: '1rem',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>📍 Location Intel</div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
              {record ? 'Your operational notes' : 'Add intelligence for this location'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {record && !editing && (
              <button onClick={() => setEditing(true)}
                style={{ padding: '.35rem .8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>
                Edit
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: 'var(--muted)', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Place name */}
        {editing && (
          <div>
            <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Location Name *</div>
            <input
              value={draft?.placeName ?? ''}
              onChange={e => setDraft(d => d ? { ...d, placeName: e.target.value } : d)}
              placeholder="e.g. Ace Hardware DC — Bozeman, MT"
              style={{ width: '100%', padding: '.65rem .9rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: '.9rem', color: 'var(--text)' }}
            />
          </div>
        )}

        {!editing && record && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '.8rem 1rem' }}>
            <div style={{ fontWeight: 800, fontSize: '1rem' }}>{record.placeName}</div>
            {(record.city || record.state) && (
              <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 2 }}>
                {[record.city, record.state].filter(Boolean).join(', ')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {record.difficultyRating && (
                <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--warn)' }}>
                  {DIFFICULTY_LABELS[record.difficultyRating]}
                </span>
              )}
              <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                {record.visitCount} visit{record.visitCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}

        {/* Tags */}
        <div>
          <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Tags</div>
          {TAG_GROUPS.map(group => (
            <div key={group.label} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.07em' }}>{group.label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {group.tags.map(tag => {
                  const active = display?.tags.includes(tag)
                  return (
                    <button
                      key={tag}
                      onClick={() => editing && toggleTag(tag)}
                      style={{
                        padding: '.3rem .65rem', borderRadius: 20, fontSize: '.72rem', fontWeight: 700,
                        cursor: editing ? 'pointer' : 'default',
                        border:     active ? '1px solid var(--primary)' : '1px solid var(--border)',
                        background: active ? 'rgba(0,232,176,.12)' : 'var(--surface-2)',
                        color:      active ? 'var(--primary)' : 'var(--muted)',
                        opacity:    !editing && !active ? 0.5 : 1,
                      }}
                    >
                      {TAG_LABELS[tag] ?? tag}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Difficulty rating */}
        {editing && (
          <div>
            <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Difficulty</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setDraft(d => d ? { ...d, difficultyRating: n } : d)}
                  style={{
                    flex: 1, padding: '.5rem', borderRadius: 10, fontSize: '.8rem', fontWeight: 800,
                    cursor: 'pointer',
                    border:     draft?.difficultyRating === n ? '1px solid var(--warn)' : '1px solid var(--border)',
                    background: draft?.difficultyRating === n ? 'rgba(245,194,0,.12)' : 'var(--surface-2)',
                    color:      draft?.difficultyRating === n ? 'var(--warn)' : 'var(--muted)',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Note sections */}
        {NOTE_SECTIONS.map(({ key, emoji, label }) => {
          type NoteKey = typeof key
          const draftVal: string | undefined = draft ? (draft[key as NoteKey] as string | undefined) : undefined
          const recordVal: string | undefined = record ? (record[key as NoteKey] as string | undefined) : undefined
          return (
            <div key={key}>
              <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>
                {emoji} {label} Notes
              </div>
              {editing ? (
                <textarea
                  value={draftVal ?? ''}
                  onChange={e => setDraft(d => d ? { ...d, [key]: e.target.value } : d)}
                  placeholder={`${label} observations, tips, warnings…`}
                  rows={2}
                  style={{ width: '100%', padding: '.65rem .9rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: '.85rem', color: 'var(--text)', resize: 'vertical', lineHeight: 1.5 }}
                />
              ) : (
                recordVal ? (
                  <div style={{ padding: '.65rem .9rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: '.85rem', lineHeight: 1.5, color: 'var(--text)' }}>
                    {recordVal}
                  </div>
                ) : (
                  <div style={{ fontSize: '.75rem', color: 'var(--muted)', fontStyle: 'italic', padding: '.4rem 0' }}>No {label.toLowerCase()} notes yet</div>
                )
              )}
            </div>
          )
        })}

        {/* Booleans */}
        {editing && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {([
              ['trailerParkingPossible', '🚛 Trailer Parking'],
              ['bobtailRecommended',    '🔄 Bobtail Here'],
              ['resetFriendly',         '🛌 Reset Friendly'],
            ] as [keyof ReceiverIntel, string][]).map(([field, label]) => {
              const val = draft?.[field]
              return (
                <button
                  key={field}
                  onClick={() => setDraft(d => d ? { ...d, [field]: !d[field] } : d)}
                  style={{
                    padding: '.6rem .4rem', borderRadius: 10, fontSize: '.7rem', fontWeight: 700,
                    cursor: 'pointer', textAlign: 'center',
                    border:     val ? '1px solid var(--primary)' : '1px solid var(--border)',
                    background: val ? 'rgba(0,232,176,.1)' : 'var(--surface-2)',
                    color:      val ? 'var(--primary)' : 'var(--muted)',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}

        {/* Actions */}
        {editing && (
          <div style={{ display: 'flex', gap: 10, paddingTop: '.5rem' }}>
            {record && (
              <button onClick={handleDelete}
                style={{ padding: '.85rem 1rem', borderRadius: 12, background: 'rgba(232,64,0,.08)', border: '1px solid rgba(232,64,0,.25)', color: 'var(--error)', fontWeight: 800, fontSize: '.85rem', cursor: 'pointer' }}>
                Delete
              </button>
            )}
            <button onClick={() => { setEditing(false); setDraft(record) }}
              style={{ flex: 1, padding: '.85rem 1rem', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', fontWeight: 800, fontSize: '.9rem', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSave}
              style={{ flex: 2, padding: '.85rem 1rem', borderRadius: 12, background: 'var(--primary)', border: 'none', color: '#061210', fontWeight: 900, fontSize: '.95rem', cursor: 'pointer' }}>
              Save Intel
            </button>
          </div>
        )}
      </div>
    </>
  )
}
