/**
 * fleet/audit.ts — Audit logging for Fleet Commander mutations (ADR-006)
 *
 * Fire-and-forget. Never awaited in the response path — does not block the caller.
 * All mutations (create, update, delete) must call audit.log().
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'

export interface AuditEntry {
  userId:     string
  email?:     string | null
  action:     string        // e.g. 'load.create' | 'fuel.update' | 'delay.delete'
  resource:   string        // table name
  resourceId?: string       // affected row ID
  before?:    unknown       // state before mutation (UPDATE/DELETE)
  after?:     unknown       // state after mutation (CREATE/UPDATE)
  metadata?:  Record<string, unknown>
  source?:    'api' | 'admin' | 'system'
}

export const audit = {
  log(entry: AuditEntry): void {
    // Fire-and-forget — never block the response on audit logging
    fleetServiceClient
      .from('fleet_audit_logs')
      .insert({
        actor_user_id: entry.userId,
        actor_email:   entry.email ?? null,
        action:        entry.action,
        resource_type: entry.resource,
        resource_id:   entry.resourceId ?? null,
        before_state:  entry.before ?? null,
        after_state:   entry.after ?? null,
        metadata:      entry.metadata ?? {},
        source:        entry.source ?? 'api',
      })
      .then(({ error }) => {
        // Silently fail — audit log failure must never break the operation
        if (error && process.env.NODE_ENV === 'development') {
          console.warn('[audit] log failed:', error.message)
        }
      })
  },
}
