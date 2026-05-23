'use client'
/**
 * violationVault.ts — Violation / Warning / Repair Document Vault
 *
 * Stores roadside inspection results, citations, warnings, OOS orders,
 * repair records, and verification docs. All localStorage-first with
 * base64 doc storage in a separate key to keep violation records lean.
 *
 * LS keys:
 *   3b-violations  — ViolationRecord[]  (max 300)
 *   3b-repairs     — RepairRecord[]     (max 600)
 *   3b-vault-docs  — VaultDoc[]         (max 200, base64 images/PDFs)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ViolationType =
  | 'roadside_inspection'
  | 'citation'
  | 'warning'
  | 'oos_order'
  | 'accident_report'
  | 'dot_audit'
  | 'weigh_station'
  | 'customs'
  | 'other'

export type ViolationSeverity =
  | 'info'
  | 'warning'
  | 'citation'
  | 'out_of_service'
  | 'critical'

export type ViolationStatus =
  | 'open'
  | 'repair_pending'
  | 'repaired'
  | 'verified'
  | 'dismissed'

export type DocType = 'photo' | 'pdf' | 'scan'

export interface VaultDoc {
  id:          string
  violationId: string
  repairId?:   string       // if attached to a specific repair
  type:        DocType
  name:        string
  dataUrl:     string       // base64 data URL
  sizeKb:      number
  createdAt:   string
}

export interface RepairRecord {
  id:            string
  violationId:   string
  description:   string
  shop?:         string
  techName?:     string
  invoiceNumber?: string
  cost?:         number
  date:          string
  notes?:        string
  docIds:        string[]   // references to VaultDoc ids
  createdAt:     string
}

export interface ViolationRecord {
  id:           string
  type:         ViolationType
  severity:     ViolationSeverity
  status:       ViolationStatus

  // Incident details
  date:         string
  location:     string
  state:        string

  // Officer / Agency
  officerName?:  string
  officerBadge?: string
  agency:        string
  reportNumber?: string

  // Links
  loadNumber?:   string
  truckId?:      string
  trailerId?:    string

  // Violation detail
  violationCodes: string[]  // e.g. ["392.2", "396.3(a)"]
  description:    string
  oosCategory?:   'driver' | 'vehicle' | 'hazmat'

  // Docs attached directly to violation (photos at scene, inspection form)
  docIds:  string[]

  // Resolution
  repairIds: string[]

  // Verification
  verifiedAt?:    string
  verifiedBy?:    string
  verificationNote?: string

  createdAt:  string
  updatedAt:  string
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export const VIOLATION_TYPE_META: Record<ViolationType, { label: string; emoji: string }> = {
  roadside_inspection: { label: 'Roadside Inspection', emoji: '🛑' },
  citation:            { label: 'Citation / Ticket',   emoji: '📋' },
  warning:             { label: 'Warning',             emoji: '⚠️' },
  oos_order:           { label: 'Out-of-Service',      emoji: '🚫' },
  accident_report:     { label: 'Accident Report',     emoji: '🚨' },
  dot_audit:           { label: 'DOT Audit',           emoji: '🔍' },
  weigh_station:       { label: 'Weigh Station',       emoji: '⚖️' },
  customs:             { label: 'Customs / Border',    emoji: '🛃' },
  other:               { label: 'Other Document',      emoji: '📁' },
}

export const SEVERITY_META: Record<ViolationSeverity, { label: string; color: string; bg: string; border: string }> = {
  info:          { label: 'Info',            color: 'var(--blue)',    bg: 'rgba(74,196,255,.07)',  border: 'rgba(74,196,255,.2)'  },
  warning:       { label: 'Warning',         color: 'var(--warn)',    bg: 'rgba(245,194,0,.07)',   border: 'rgba(245,194,0,.25)'  },
  citation:      { label: 'Citation',        color: '#e89000',        bg: 'rgba(232,144,0,.07)',   border: 'rgba(232,144,0,.25)'  },
  out_of_service: { label: 'Out-of-Service', color: 'var(--error)',   bg: 'rgba(232,64,0,.09)',    border: 'rgba(232,64,0,.3)'    },
  critical:      { label: 'Critical',        color: '#ff2020',        bg: 'rgba(255,32,32,.1)',    border: 'rgba(255,32,32,.35)'  },
}

export const STATUS_META: Record<ViolationStatus, { label: string; color: string; dot: string }> = {
  open:           { label: 'Open',           color: 'var(--error)',   dot: '#e84000' },
  repair_pending: { label: 'Repair Pending', color: '#e89000',        dot: '#e89000' },
  repaired:       { label: 'Repaired',       color: 'var(--blue)',    dot: '#4ac4ff' },
  verified:       { label: 'Verified ✓',     color: 'var(--primary)', dot: '#00e8b0' },
  dismissed:      { label: 'Dismissed',      color: 'var(--muted)',   dot: '#666'    },
}

export const OOS_CATEGORY_LABEL: Record<string, string> = {
  driver:  'Driver OOS',
  vehicle: 'Vehicle OOS',
  hazmat:  'Hazmat OOS',
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const VIOLATION_KEY = '3b-violations'
const REPAIR_KEY    = '3b-repairs'
const DOC_KEY       = '3b-vault-docs'
const MAX_VIOLATIONS = 300
const MAX_REPAIRS    = 600
const MAX_DOCS       = 200

function readViolations(): ViolationRecord[] {
  try { return JSON.parse(localStorage.getItem(VIOLATION_KEY) ?? '[]') } catch { return [] }
}
function saveViolations(list: ViolationRecord[]) {
  localStorage.setItem(VIOLATION_KEY, JSON.stringify(list.slice(0, MAX_VIOLATIONS)))
}

function readRepairs(): RepairRecord[] {
  try { return JSON.parse(localStorage.getItem(REPAIR_KEY) ?? '[]') } catch { return [] }
}
function saveRepairs(list: RepairRecord[]) {
  localStorage.setItem(REPAIR_KEY, JSON.stringify(list.slice(0, MAX_REPAIRS)))
}

function readDocs(): VaultDoc[] {
  try { return JSON.parse(localStorage.getItem(DOC_KEY) ?? '[]') } catch { return [] }
}
function saveDocs(list: VaultDoc[]) {
  localStorage.setItem(DOC_KEY, JSON.stringify(list.slice(0, MAX_DOCS)))
}

function uid() {
  return `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ── Violation CRUD ────────────────────────────────────────────────────────────

export function createViolation(
  input: Omit<ViolationRecord, 'id' | 'docIds' | 'repairIds' | 'createdAt' | 'updatedAt'>
): ViolationRecord {
  const now = new Date().toISOString()
  const record: ViolationRecord = {
    ...input,
    id:        uid(),
    docIds:    [],
    repairIds: [],
    createdAt: now,
    updatedAt: now,
  }
  const list = readViolations()
  list.unshift(record)
  saveViolations(list)
  return record
}

export function updateViolation(
  id: string,
  patch: Partial<Omit<ViolationRecord, 'id' | 'createdAt'>>
): ViolationRecord | null {
  const list = readViolations()
  const idx  = list.findIndex(v => v.id === id)
  if (idx === -1) return null
  const updated = { ...list[idx], ...patch, updatedAt: new Date().toISOString() }
  list[idx] = updated
  saveViolations(list)
  return updated
}

export function deleteViolation(id: string) {
  // Also remove attached repairs and docs
  const violation = readViolations().find(v => v.id === id)
  if (violation) {
    saveRepairs(readRepairs().filter(r => r.violationId !== id))
    saveDocs(readDocs().filter(d => d.violationId !== id))
  }
  saveViolations(readViolations().filter(v => v.id !== id))
}

export function getViolations(): ViolationRecord[] {
  return readViolations()
}

export function getViolation(id: string): ViolationRecord | undefined {
  return readViolations().find(v => v.id === id)
}

// ── Repair CRUD ───────────────────────────────────────────────────────────────

export function addRepair(
  violationId: string,
  input: Omit<RepairRecord, 'id' | 'violationId' | 'docIds' | 'createdAt'>
): RepairRecord {
  const repair: RepairRecord = {
    ...input,
    id:          uid(),
    violationId,
    docIds:      [],
    createdAt:   new Date().toISOString(),
  }
  const repairs = readRepairs()
  repairs.unshift(repair)
  saveRepairs(repairs)

  // Link repair to violation + auto-advance status
  const vList = readViolations()
  const vIdx  = vList.findIndex(v => v.id === violationId)
  if (vIdx !== -1) {
    const v = vList[vIdx]
    vList[vIdx] = {
      ...v,
      repairIds: [repair.id, ...v.repairIds],
      status:    v.status === 'open' ? 'repair_pending' : v.status,
      updatedAt: new Date().toISOString(),
    }
    saveViolations(vList)
  }

  return repair
}

export function updateRepair(
  id: string,
  patch: Partial<Omit<RepairRecord, 'id' | 'violationId' | 'createdAt'>>
): RepairRecord | null {
  const list = readRepairs()
  const idx  = list.findIndex(r => r.id === id)
  if (idx === -1) return null
  list[idx] = { ...list[idx], ...patch }
  saveRepairs(list)
  return list[idx]
}

export function getRepairsForViolation(violationId: string): RepairRecord[] {
  return readRepairs().filter(r => r.violationId === violationId)
}

// ── Document upload ───────────────────────────────────────────────────────────

export const MAX_DOC_SIZE_KB = 3000  // 3 MB per doc warning threshold

export async function attachDoc(
  violationId: string,
  file: File,
  repairId?: string
): Promise<VaultDoc | { error: string }> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl  = reader.result as string
      const sizeKb   = Math.round(file.size / 1024)
      const docType: DocType =
        file.type.startsWith('image/') ? 'photo' :
        file.type === 'application/pdf' ? 'pdf' : 'scan'

      const doc: VaultDoc = {
        id:          uid(),
        violationId,
        repairId,
        type:        docType,
        name:        file.name,
        dataUrl,
        sizeKb,
        createdAt:   new Date().toISOString(),
      }

      const docs = readDocs()
      docs.unshift(doc)
      saveDocs(docs)

      // Link doc id to violation (and optionally repair)
      const vList = readViolations()
      const vIdx  = vList.findIndex(v => v.id === violationId)
      if (vIdx !== -1) {
        vList[vIdx].docIds.unshift(doc.id)
        vList[vIdx].updatedAt = new Date().toISOString()
        saveViolations(vList)
      }
      if (repairId) {
        const rList = readRepairs()
        const rIdx  = rList.findIndex(r => r.id === repairId)
        if (rIdx !== -1) {
          rList[rIdx].docIds.unshift(doc.id)
          saveRepairs(rList)
        }
      }

      resolve(doc)
    }
    reader.onerror = () => resolve({ error: 'Failed to read file' })
    reader.readAsDataURL(file)
  })
}

export function getDocsForViolation(violationId: string): VaultDoc[] {
  return readDocs().filter(d => d.violationId === violationId)
}

export function getDoc(id: string): VaultDoc | undefined {
  return readDocs().find(d => d.id === id)
}

export function deleteDoc(id: string) {
  const doc = readDocs().find(d => d.id === id)
  if (!doc) return
  saveDocs(readDocs().filter(d => d.id !== id))
  // Unlink from violation
  const vList = readViolations()
  const vIdx  = vList.findIndex(v => v.id === doc.violationId)
  if (vIdx !== -1) {
    vList[vIdx].docIds = vList[vIdx].docIds.filter(x => x !== id)
    saveViolations(vList)
  }
  // Unlink from repair if attached
  if (doc.repairId) {
    const rList = readRepairs()
    const rIdx  = rList.findIndex(r => r.id === doc.repairId)
    if (rIdx !== -1) {
      rList[rIdx].docIds = rList[rIdx].docIds.filter(x => x !== id)
      saveRepairs(rList)
    }
  }
}

// ── Status transitions ────────────────────────────────────────────────────────

export function markRepaired(violationId: string): ViolationRecord | null {
  return updateViolation(violationId, { status: 'repaired' })
}

export function markVerified(violationId: string, by: string, note?: string): ViolationRecord | null {
  return updateViolation(violationId, {
    status: 'verified',
    verifiedAt: new Date().toISOString(),
    verifiedBy: by,
    verificationNote: note,
  })
}

export function markDismissed(violationId: string): ViolationRecord | null {
  return updateViolation(violationId, { status: 'dismissed' })
}

// ── Summary stats ─────────────────────────────────────────────────────────────

export interface VaultSummary {
  total:       number
  open:        number
  oos:         number
  repairPending: number
  verified:    number
  recentDays:  number  // violations in last 90 days
}

export function getVaultSummary(): VaultSummary {
  const list = readViolations()
  const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()
  return {
    total:         list.length,
    open:          list.filter(v => v.status === 'open').length,
    oos:           list.filter(v => v.severity === 'out_of_service').length,
    repairPending: list.filter(v => v.status === 'repair_pending').length,
    verified:      list.filter(v => v.status === 'verified').length,
    recentDays:    list.filter(v => v.createdAt >= cutoff).length,
  }
}
