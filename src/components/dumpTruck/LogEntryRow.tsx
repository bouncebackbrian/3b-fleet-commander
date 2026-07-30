'use client'
import { useState } from 'react'
import { EVENT_LABELS } from '@/lib/dumpTruck/eventLabels'
import { siteAwareActionLabel, type SiteAwareLabelContext } from '@/lib/dumpTruck/actionLabels'
import LocationMapSheet from './LocationMapSheet'
import type { TimelineEntry } from '@/hooks/useDumpTruckDriver'

export function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  } catch { return iso }
}

/** One Day Activity / Full Log row — shared by RightRail and FullLogSheet so the
 *  "Open in Maps" button (shown whenever the event captured GPS) stays in one place.
 *  `labelCtx` names the actual site/material (e.g. "Load Road Grindings" instead of
 *  the generic "Loading Started") using the same site-aware helper as the primary
 *  action button, so the log reads the same as what the driver tapped. */
export default function LogEntryRow({ entry, labelCtx }: { entry: TimelineEntry; labelCtx?: SiteAwareLabelContext }) {
  const [showMap, setShowMap] = useState(false)
  const hasLocation = entry.lat != null && entry.lng != null
  const label = siteAwareActionLabel(entry.eventType, EVENT_LABELS[entry.eventType] ?? entry.eventType, labelCtx ?? {})

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '.5rem .6rem',
        borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)',
        opacity: entry.pending ? .65 : 1,
      }}>
        <span style={{ fontSize: '.9rem' }}>{entry.pending ? '⏳' : '✅'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.82rem', fontWeight: 700 }}>{label}</div>
          {entry.notes && <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{entry.notes}</div>}
        </div>
        {hasLocation && (
          <button
            onClick={() => setShowMap(true)}
            aria-label="Open in Maps"
            style={{
              fontSize: '1rem', flexShrink: 0, padding: '.25rem .4rem', borderRadius: 6,
              background: 'var(--surface)', border: '1px solid var(--border)',
            }}
          >
            🗺️
          </button>
        )}
        <div style={{ fontSize: '.72rem', color: 'var(--muted)', flexShrink: 0 }}>
          {fmtTime(entry.effectiveAt)}
        </div>
      </div>
      {showMap && hasLocation && (
        <LocationMapSheet lat={entry.lat!} lng={entry.lng!} label={label} onClose={() => setShowMap(false)} />
      )}
    </>
  )
}
