'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { TripReview } from '@/lib/dashboard/types'

// ── Completed trip record (minimal — display only) ────────────────────────────
type CompletedTrip = {
  id:          string
  loadNumber:  string
  origin:      string
  destination: string
  date:        string
  completedAt: string | null
  tripReview:  TripReview | null
}

interface Props {
  open:    boolean
  onClose: () => void
}

// ── Issue tag derivation ──────────────────────────────────────────────────────
function issueTags(r: TripReview): { label: string; emoji: string }[] {
  const tags: { label: string; emoji: string }[] = []
  if (r.detention)     tags.push({ emoji: '⏱',  label: 'Detention'    })
  if (r.parkingIssue)  tags.push({ emoji: '🅿️', label: 'Parking'      })
  if (r.routeProblem)  tags.push({ emoji: '🗺',  label: 'Route'        })
  if (r.fuelIssue)     tags.push({ emoji: '⛽', label: 'Fuel'         })
  if (r.weatherDelay)  tags.push({ emoji: '🌧️', label: 'Weather'      })
  if (r.receiverDelay) tags.push({ emoji: '📦', label: 'Rcvr Delay'   })
  return tags
}

function ratingStars(n: number): string {
  return '⭐'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n))
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return iso }
}

// ── Fetch from Supabase or localStorage fallback ──────────────────────────────
async function fetchCompleted(): Promise<CompletedTrip[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('fleet_missions')
        .select('id, load_number, origin, destination, date, mission_status, metadata')
        .eq('mission_status', 'completed')
        .order('created_at', { ascending: false })
        .limit(30)

      if (!error && data) {
        return data.map((row: Record<string, unknown>) => ({
          id:          String(row.id ?? ''),
          loadNumber:  String(row.load_number ?? ''),
          origin:      String(row.origin ?? ''),
          destination: String(row.destination ?? ''),
          date:        String(row.date ?? ''),
          completedAt: ((row.metadata as Record<string, unknown>)?.tripReview as TripReview | undefined)?.reviewedAt ?? null,
          tripReview:  ((row.metadata as Record<string, unknown>)?.tripReview as TripReview | undefined) ?? null,
        }))
      }
    } catch { /* fall through */ }
  }

  // localStorage fallback
  try {
    const raw = localStorage.getItem('3b-completed-missions')
    if (raw) return JSON.parse(raw) as CompletedTrip[]
  } catch { /* ignore */ }
  return []
}

export default function CompletedTripsPanel({ open, onClose }: Props) {
  const [trips,   setTrips]   = useState<CompletedTrip[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetchCompleted()
      .then(setTrips)
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 350 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 351,
        background: 'var(--surface)', borderRadius: '18px 18px 0 0',
        padding: '1.5rem 1.25rem 2.5rem',
        boxShadow: '0 -6px 32px rgba(0,0,0,.4)',
        maxHeight: '88vh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 1.2rem' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>✅ Completed Trips</div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2, fontWeight: 600 }}>
              {trips.length > 0 ? `${trips.length} archived load${trips.length > 1 ? 's' : ''}` : 'Completed loads appear here'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: 'var(--muted)', cursor: 'pointer', padding: '.2rem .4rem', lineHeight: 1 }}
          >×</button>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: '.85rem' }}>
            ⟳ Loading completed trips…
          </div>
        ) : trips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>🏁</div>
            <div style={{ fontWeight: 800, fontSize: '.9rem', marginBottom: '.35rem' }}>No completed trips yet</div>
            <div style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>
              Complete your first load using the{' '}
              <span style={{ color: 'var(--success)', fontWeight: 700 }}>Complete Trip</span>{' '}
              button on the Active Load card.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.65rem' }}>
            {trips.map(trip => {
              const r       = trip.tripReview
              const tags    = r ? issueTags(r) : []
              const isOpen  = expanded === trip.id

              return (
                <div
                  key={trip.id}
                  style={{
                    borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)',
                    overflow: 'hidden', cursor: 'pointer',
                  }}
                  onClick={() => setExpanded(isOpen ? null : trip.id)}
                >
                  {/* Summary row */}
                  <div style={{ padding: '.75rem .9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Load number + route */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                        {trip.loadNumber && (
                          <span style={{ fontWeight: 900, fontSize: '.82rem', color: 'var(--primary)' }}>{trip.loadNumber}</span>
                        )}
                        <span style={{ fontWeight: 700, fontSize: '.82rem', color: 'var(--text)' }}>
                          {trip.origin.split(',')[0]} → {trip.destination.split(',')[0]}
                        </span>
                      </div>
                      {/* Date + rating */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600 }}>
                          {fmtDate(trip.completedAt ?? trip.date)}
                        </span>
                        {r && (
                          <span style={{ fontSize: '.72rem', letterSpacing: '-.02em' }}>{ratingStars(r.driverRating)}</span>
                        )}
                        {!r?.wouldRunAgain && r && (
                          <span style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--error)', padding: '.1rem .4rem', borderRadius: 4, background: 'rgba(232,64,0,.08)', border: '1px solid rgba(232,64,0,.2)' }}>
                            skip lane
                          </span>
                        )}
                        {r?.wouldRunAgain && (
                          <span style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--success)', padding: '.1rem .4rem', borderRadius: 4, background: 'rgba(40,192,72,.08)', border: '1px solid rgba(40,192,72,.2)' }}>
                            ✓ run again
                          </span>
                        )}
                      </div>
                      {/* Issue tags */}
                      {tags.length > 0 && (
                        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: 5 }}>
                          {tags.map(t => (
                            <span key={t.label} style={{
                              fontSize: '.6rem', fontWeight: 700, padding: '.15rem .45rem', borderRadius: 5,
                              background: 'rgba(245,194,0,.09)', border: '1px solid rgba(245,194,0,.22)', color: 'var(--warn)',
                            }}>
                              {t.emoji} {t.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Expand chevron */}
                    <span style={{ color: 'var(--muted)', fontSize: '.75rem', flexShrink: 0, marginTop: 2, transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                      ▾
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && r && (
                    <div style={{ padding: '.65rem .9rem 1rem', borderTop: '1px solid var(--border)', display: 'grid', gap: '.5rem' }}>
                      {/* Timing */}
                      {(r.actualStart || r.actualEnd) && (
                        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600 }}>
                          {r.actualStart && <span>🕐 Start: <strong style={{ color: 'var(--text)' }}>{fmtDate(r.actualStart)}</strong></span>}
                          {r.actualEnd   && <span>🏁 End: <strong style={{ color: 'var(--text)' }}>{fmtDate(r.actualEnd)}</strong></span>}
                        </div>
                      )}
                      {/* Stop accuracy */}
                      <div style={{ fontSize: '.72rem', fontWeight: 600, color: r.stopsAccurate ? 'var(--success)' : 'var(--warn)' }}>
                        {r.stopsAccurate ? '✓ Stops completed as planned' : '⚠ Stop plan deviated'}
                      </div>
                      {/* Notes */}
                      {r.notes && (
                        <div style={{ fontSize: '.75rem', color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.4, padding: '.4rem .6rem', background: 'var(--surface)', borderRadius: 7, border: '1px solid var(--border)' }}>
                          {r.notes}
                        </div>
                      )}
                    </div>
                  )}

                  {/* No review note */}
                  {isOpen && !r && (
                    <div style={{ padding: '.5rem .9rem .75rem', borderTop: '1px solid var(--border)', fontSize: '.72rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                      No trip review attached to this load.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
