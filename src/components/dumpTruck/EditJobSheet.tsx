'use client'
/**
 * EditJobSheet — driver-facing "dispatch changed it on us" correction.
 *
 * Drivers can only change material and pickup/dump site — the physical
 * details dispatch relays verbally mid-shift — not job numbers, pricing, or
 * customer/broker fields (those stay admin-only in /admin/dump-truck).
 * PATCHes /api/fleet/dump-truck/jobs/[id], which is intentionally open to
 * any active business member. The caller is responsible for logging a
 * visible timeline note summarizing what changed (see onSaved).
 */
import { useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'
import { toast } from '@/hooks/useToast'
import type { DumpTruckJob, DumpTruckSite } from '@/lib/dumpTruck/types'

interface Props {
  job: DumpTruckJob
  sites: DumpTruckSite[]
  onClose: () => void
  onSaved: (summary: string) => void
}

export default function EditJobSheet({ job, sites, onClose, onSaved }: Props) {
  const [material, setMaterial] = useState(job.material ?? '')
  const [pickupSiteId, setPickupSiteId] = useState(job.pickupSiteId ?? '')
  const [dumpSiteId, setDumpSiteId] = useState(job.dumpSiteId ?? '')
  const [scheduledEndTime, setScheduledEndTime] = useState(job.scheduledEndTime ?? '')
  const [signedOutBy, setSignedOutBy] = useState(job.signedOutBy ?? '')
  const [busy, setBusy] = useState(false)

  const pickupSites = sites.filter(s => s.siteType === 'pickup' || s.siteType === 'customer')
  const dumpSites = sites.filter(s => s.siteType === 'dump' || s.siteType === 'disposal')

  const changed =
    material !== (job.material ?? '') || pickupSiteId !== (job.pickupSiteId ?? '') || dumpSiteId !== (job.dumpSiteId ?? '') ||
    scheduledEndTime !== (job.scheduledEndTime ?? '') || signedOutBy !== (job.signedOutBy ?? '')

  const save = async (extra?: { signedOutAt?: string }) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/fleet/dump-truck/jobs/${job.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material: material.trim() || null,
          pickupSiteId: pickupSiteId || null,
          dumpSiteId: dumpSiteId || null,
          scheduledEndTime: scheduledEndTime.trim() || null,
          signedOutBy: signedOutBy.trim() || null,
          ...extra,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not update job')

      const changes: string[] = []
      if (material !== (job.material ?? '')) changes.push(`material: "${job.material ?? '—'}" → "${material || '—'}"`)
      if (pickupSiteId !== (job.pickupSiteId ?? '')) {
        const from = sites.find(s => s.id === job.pickupSiteId)?.name ?? '—'
        const to = sites.find(s => s.id === pickupSiteId)?.name ?? '—'
        changes.push(`pickup site: "${from}" → "${to}"`)
      }
      if (dumpSiteId !== (job.dumpSiteId ?? '')) {
        const from = sites.find(s => s.id === job.dumpSiteId)?.name ?? '—'
        const to = sites.find(s => s.id === dumpSiteId)?.name ?? '—'
        changes.push(`dump site: "${from}" → "${to}"`)
      }
      if (scheduledEndTime !== (job.scheduledEndTime ?? '')) changes.push(`scheduled end time: "${scheduledEndTime || '—'}"`)
      if (extra?.signedOutAt) changes.push(`signed out by ${signedOutBy.trim() || 'job site'} at ${new Date(extra.signedOutAt).toLocaleTimeString()}`)
      else if (signedOutBy !== (job.signedOutBy ?? '')) changes.push(`signed out by: "${signedOutBy || '—'}"`)

      toast.success(extra?.signedOutAt ? 'Signed out' : 'Job updated')
      onSaved(`Job ${job.jobNumber} updated by driver — ${changes.join('; ')}`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update job')
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (!changed) { onClose(); return }
    await save()
  }

  const signOutNow = () => save({ signedOutAt: new Date().toISOString() })

  return (
    <Sheet title={`Edit Job ${job.jobNumber}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
          Dispatch change it on you? Update the material or site here — this is saved to the job and logged
          to the day&apos;s activity log so dispatch sees the correction.
        </p>

        <div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>Material</div>
          <input style={inputStyle} value={material} onChange={e => setMaterial(e.target.value)} placeholder="e.g. 3/4 Minus Gravel" />
        </div>

        <div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>Pickup Site</div>
          <select style={inputStyle} value={pickupSiteId} onChange={e => setPickupSiteId(e.target.value)}>
            <option value="">Unassigned</option>
            {pickupSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>Dump Site</div>
          <select style={inputStyle} value={dumpSiteId} onChange={e => setDumpSiteId(e.target.value)}>
            <option value="">Unassigned</option>
            {dumpSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>
            Scheduled End Time (as written on paper)
          </div>
          <input
            style={inputStyle} value={scheduledEndTime} onChange={e => setScheduledEndTime(e.target.value)}
            placeholder='e.g. "3:15 PM incl. drive to yard"'
          />
        </div>

        <div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>Signed Out By</div>
          <input style={inputStyle} value={signedOutBy} onChange={e => setSignedOutBy(e.target.value)} placeholder="Name of job-site rep who releases you" />
          {job.signedOutAt && (
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
              Signed out at {new Date(job.signedOutAt).toLocaleString()}
            </div>
          )}
        </div>

        <button style={{ ...primaryBtnStyle, opacity: !busy ? 1 : .5 }} disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : changed ? 'Save Changes' : 'No Changes'}
        </button>
        <button
          style={{ padding: '.75rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontWeight: 700, opacity: !busy ? 1 : .5 }}
          disabled={busy} onClick={signOutNow}
        >
          ✍️ Sign Me Out Now
        </button>
      </div>
    </Sheet>
  )
}
