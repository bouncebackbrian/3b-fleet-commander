'use client'
/**
 * proofVault.ts — Unified Proof Vault document store
 *
 * Every doc that protects the driver: BOLs, rate cons, PODs, inspection
 * reports, repair invoices, registration, permits, insurance cards.
 *
 * Write-through: base64 content in localStorage (offline-ready, instant)
 * + metadata row in Supabase fleet_documents (queryable, exportable).
 *
 * LS keys:
 *   3b-proof-vault       — ProofDoc[]   (max 150, each can be large)
 *   3b-vault-categories  — string[]     (user-created custom categories)
 *
 * Size limits:
 *   Soft warning at 2 MB per doc. Hard reject at 8 MB.
 *   Total vault localStorage cap enforced by slice(0, 150).
 */

import { createClient } from '@/lib/supabase-browser'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DocFileType = 'photo' | 'pdf' | 'scan' | 'other'

export type DocCategory =
  | 'bol'
  | 'rate_con'
  | 'pod'
  | 'inspection_report'
  | 'violation_citation'
  | 'repair_invoice'
  | 'registration'
  | 'insurance'
  | 'permit'
  | 'scale_ticket'
  | 'fuel_receipt'
  | 'lumper_receipt'
  | 'pre_trip'
  | 'accident_report'
  | 'other'

export interface ProofDoc {
  id:           string
  // ── File content ────────────────────────────────────────────────────────────
  dataUrl:      string      // base64 data URL — source of truth offline
  fileName:     string
  fileType:     DocFileType
  mimeType:     string
  sizeKb:       number

  // ── Classification ──────────────────────────────────────────────────────────
  category:     DocCategory
  notes?:       string

  // ── Entity links (any combination) ──────────────────────────────────────────
  loadId?:        string    // fleet_loads uuid
  loadNumber?:    string    // human label for display
  stopId?:        string    // fleet_load_stops uuid
  stopName?:      string    // facility name for display
  violationId?:   string    // fleet_violations uuid
  repairId?:      string    // fleet_repairs uuid
  inspectionId?:  string    // fleet_inspections uuid
  truckId?:       string    // tractor/unit # (string, not uuid)
  trailerId?:     string    // trailer # (string, not uuid)

  // ── Supabase sync ───────────────────────────────────────────────────────────
  supabaseId?:  string      // fleet_documents.id once synced

  // ── Timestamps ──────────────────────────────────────────────────────────────
  occurredAt?:  string      // when the document was created (user-set)
  createdAt:    string      // when it was uploaded to the vault
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export const CATEGORY_META: Record<DocCategory, { label: string; emoji: string; roadsideGroup: RoadsideGroup }> = {
  bol:               { label: 'Bill of Lading',        emoji: '📄', roadsideGroup: 'load'       },
  rate_con:          { label: 'Rate Confirmation',      emoji: '💰', roadsideGroup: 'load'       },
  pod:               { label: 'Proof of Delivery',      emoji: '✅', roadsideGroup: 'load'       },
  inspection_report: { label: 'Inspection Report',      emoji: '🔍', roadsideGroup: 'inspection' },
  violation_citation:{ label: 'Violation / Citation',   emoji: '📋', roadsideGroup: 'violation'  },
  repair_invoice:    { label: 'Repair Invoice',         emoji: '🔧', roadsideGroup: 'repair'     },
  registration:      { label: 'Registration',           emoji: '📑', roadsideGroup: 'truck'      },
  insurance:         { label: 'Insurance Card',         emoji: '🛡️', roadsideGroup: 'truck'      },
  permit:            { label: 'Permit',                 emoji: '🪪', roadsideGroup: 'truck'      },
  scale_ticket:      { label: 'Scale Ticket',           emoji: '⚖️', roadsideGroup: 'load'       },
  fuel_receipt:      { label: 'Fuel Receipt',           emoji: '⛽', roadsideGroup: 'load'       },
  lumper_receipt:    { label: 'Lumper Receipt',         emoji: '🏋️', roadsideGroup: 'load'       },
  pre_trip:          { label: 'Pre-Trip Inspection',    emoji: '🚛', roadsideGroup: 'inspection' },
  accident_report:   { label: 'Accident Report',        emoji: '🚨', roadsideGroup: 'violation'  },
  other:             { label: 'Other Document',         emoji: '📁', roadsideGroup: 'other'      },
}

export type RoadsideGroup = 'load' | 'inspection' | 'violation' | 'repair' | 'truck' | 'other'

export const ROADSIDE_GROUPS: Record<RoadsideGroup, { label: string; emoji: string; desc: string; color: string }> = {
  load:       { label: 'Load Docs',        emoji: '📦', desc: 'BOL, Rate Con, POD, scale tickets', color: 'var(--primary)' },
  inspection: { label: 'Inspection Proof', emoji: '🔍', desc: 'Inspection reports, pre-trips',      color: 'var(--blue)'    },
  violation:  { label: 'Violation / Citation', emoji: '📋', desc: 'Citations, OOS orders, accident reports', color: 'var(--warn)' },
  repair:     { label: 'Repair Proof',     emoji: '🔧', desc: 'Repair invoices, shop receipts',     color: '#e89000'        },
  truck:      { label: 'Truck / Trailer',  emoji: '🚛', desc: 'Registration, insurance, permits',   color: 'var(--muted)'   },
  other:      { label: 'Other',            emoji: '📁', desc: 'Miscellaneous documents',            color: 'var(--muted)'   },
}

// ── Size limits ───────────────────────────────────────────────────────────────

export const MAX_DOC_SIZE_KB   = 8192   // 8 MB — hard reject
export const WARN_DOC_SIZE_KB  = 2048   // 2 MB — show warning but allow

// ── Storage ───────────────────────────────────────────────────────────────────

const VAULT_KEY = '3b-proof-vault'
const MAX_DOCS  = 150

function readVault(): ProofDoc[] {
  try { return JSON.parse(localStorage.getItem(VAULT_KEY) ?? '[]') } catch { return [] }
}
function saveVault(docs: ProofDoc[]) {
  localStorage.setItem(VAULT_KEY, JSON.stringify(docs.slice(0, MAX_DOCS)))
}

function uid() {
  return `pd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sb() {
  try { return createClient() } catch { return null }
}

// ── Upload ────────────────────────────────────────────────────────────────────

export interface UploadInput {
  file:          File
  category:      DocCategory
  notes?:        string
  occurredAt?:   string
  loadId?:       string
  loadNumber?:   string
  stopId?:       string
  stopName?:     string
  violationId?:  string
  repairId?:     string
  inspectionId?: string
  truckId?:      string
  trailerId?:    string
}

export type UploadResult =
  | { ok: true;  doc: ProofDoc }
  | { ok: false; error: string }

export async function uploadDoc(input: UploadInput): Promise<UploadResult> {
  const sizeKb = Math.round(input.file.size / 1024)

  if (sizeKb > MAX_DOC_SIZE_KB) {
    return { ok: false, error: `File too large (${sizeKb} KB). Max ${MAX_DOC_SIZE_KB} KB.` }
  }

  // Read file as base64
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(input.file)
  }).catch(e => { throw e })

  const fileType: DocFileType =
    input.file.type.startsWith('image/') ? 'photo' :
    input.file.type === 'application/pdf' ? 'pdf' : 'scan'

  const doc: ProofDoc = {
    id:           uid(),
    dataUrl,
    fileName:     input.file.name,
    fileType,
    mimeType:     input.file.type,
    sizeKb,
    category:     input.category,
    notes:        input.notes        || undefined,
    loadId:       input.loadId       || undefined,
    loadNumber:   input.loadNumber   || undefined,
    stopId:       input.stopId       || undefined,
    stopName:     input.stopName     || undefined,
    violationId:  input.violationId  || undefined,
    repairId:     input.repairId     || undefined,
    inspectionId: input.inspectionId || undefined,
    truckId:      input.truckId      || undefined,
    trailerId:    input.trailerId    || undefined,
    occurredAt:   input.occurredAt   || undefined,
    createdAt:    new Date().toISOString(),
  }

  // Save to localStorage
  const vault = readVault()
  vault.unshift(doc)
  saveVault(vault)

  // Sync metadata to Supabase (fire-and-forget, no dataUrl — keep DB lean)
  persistDocMetadata(doc).catch(() => { /* silent fail */ })

  return { ok: true, doc }
}

async function persistDocMetadata(doc: ProofDoc) {
  const client = sb()
  if (!client) return

  const { data, error } = await client
    .from('fleet_documents')
    .insert({
      load_id:      doc.loadId      ?? null,
      stop_id:      doc.stopId      ?? null,
      violation_id: doc.violationId ?? null,
      repair_id:    doc.repairId    ?? null,
      load_number:  doc.loadNumber  ?? null,
      doc_type:     doc.category,
      file_name:    doc.fileName,
      mime_type:    doc.mimeType,
      size_kb:      doc.sizeKb,
      notes:        doc.notes       ?? null,
      occurred_at:  doc.occurredAt  ?? null,
      logged_at:    doc.createdAt,
    })
    .select('id')
    .single()

  if (!error && data?.id) {
    // Tag local doc with Supabase id
    const vault = readVault()
    const idx   = vault.findIndex(d => d.id === doc.id)
    if (idx !== -1) { vault[idx].supabaseId = data.id; saveVault(vault) }
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function getDocs(): ProofDoc[] {
  return readVault()
}

export function getDoc(id: string): ProofDoc | undefined {
  return readVault().find(d => d.id === id)
}

export function updateDoc(id: string, patch: Partial<Pick<ProofDoc, 'category' | 'notes' | 'loadNumber' | 'loadId' | 'stopId' | 'stopName' | 'violationId' | 'repairId' | 'inspectionId' | 'truckId' | 'trailerId' | 'occurredAt'>>): ProofDoc | null {
  const vault = readVault()
  const idx   = vault.findIndex(d => d.id === id)
  if (idx === -1) return null
  vault[idx] = { ...vault[idx], ...patch }
  saveVault(vault)
  return vault[idx]
}

export function deleteDoc(id: string) {
  saveVault(readVault().filter(d => d.id !== id))
}

// ── Filtered views ────────────────────────────────────────────────────────────

export function getDocsByLoad(loadId: string): ProofDoc[] {
  return readVault().filter(d => d.loadId === loadId || d.loadNumber === loadId)
}

export function getDocsByViolation(violationId: string): ProofDoc[] {
  return readVault().filter(d => d.violationId === violationId)
}

export function getDocsByRepair(repairId: string): ProofDoc[] {
  return readVault().filter(d => d.repairId === repairId)
}

export function getDocsByTruck(truckId: string): ProofDoc[] {
  return readVault().filter(d => d.truckId === truckId)
}

export function getDocsByTrailer(trailerId: string): ProofDoc[] {
  return readVault().filter(d => d.trailerId === trailerId)
}

export function getDocsByGroup(group: RoadsideGroup): ProofDoc[] {
  const cats = Object.entries(CATEGORY_META)
    .filter(([, m]) => m.roadsideGroup === group)
    .map(([k]) => k as DocCategory)
  return readVault().filter(d => cats.includes(d.category))
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface VaultSummary {
  total:       number
  byGroup:     Record<RoadsideGroup, number>
  totalSizeKb: number
  recentCount: number  // added in last 7 days
}

export function getVaultSummary(): VaultSummary {
  const docs    = readVault()
  const cutoff  = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const byGroup = {} as Record<RoadsideGroup, number>
  for (const g of Object.keys(ROADSIDE_GROUPS) as RoadsideGroup[]) byGroup[g] = 0
  docs.forEach(d => { byGroup[CATEGORY_META[d.category].roadsideGroup]++ })
  return {
    total:       docs.length,
    byGroup,
    totalSizeKb: docs.reduce((a, d) => a + d.sizeKb, 0),
    recentCount: docs.filter(d => d.createdAt >= cutoff).length,
  }
}

// ── Quick-load from active session ────────────────────────────────────────────
// Reads 3b-fleet-settings / 3b-latest-load for auto-linking suggestions
export function getContextSuggestions(): {
  loadNumber?: string; loadId?: string
  truckId?: string; trailerId?: string
} {
  try {
    const settings  = JSON.parse(localStorage.getItem('3b-fleet-settings') ?? '{}')
    const lastLoad  = JSON.parse(localStorage.getItem('3b-latest-load')    ?? '{}')
    return {
      loadNumber: lastLoad.loadNumber || undefined,
      loadId:     lastLoad.id         || undefined,
      truckId:    settings.truckNum   || undefined,
      trailerId:  settings.trailerNum || undefined,
    }
  } catch { return {} }
}
