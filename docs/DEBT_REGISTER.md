# Fleet Commander — Technical Debt Register

> Last updated: 2026-06-07

---

## DEBT-001 — `fleet_load_board_cache` RLS

**Type:** Security  
**Status:** Parked  
**Opened:** Phase 2 refactor (2026-06-07)  
**Condition to close:** Explicit security pass on load board cache table

**Description:**  
`fleet_load_board_cache` RLS policy was flagged during Phase 2 refactor as potentially permissive. Deliberately excluded from the Phase 2 data-layer refactor to avoid scope creep.

**Action required:**  
- Audit RLS policies on `fleet_load_board_cache`
- Verify no unintended cross-user read access
- Apply tighter policy or service-role-only access

---

## DEBT-002 — Fleet DB auth fallback in `api-auth.ts`

**Type:** Architecture — transitional coupling  
**Status:** Active — removal clock started 2026-06-07  
**Condition to close:** Core_Eco auth verified stable in production across all routes

**Description:**  
`api-auth.ts` and all Core_Eco clients fall back to Fleet DB credentials if Core_Eco env vars are absent:

```typescript
// src/lib/api-auth.ts
function coreEcoCreds() {
  return {
    url: process.env.NEXT_PUBLIC_CORE_ECO_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key: process.env.NEXT_PUBLIC_CORE_ECO_ANON_KEY ??
         process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
         process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  }
}
```

The fallback was intentional during Core_Eco env var rollout. It is tech debt because it silently masks a misconfigured environment.

**Verification checklist before removing fallback:**

```
[ ] Login flow works end-to-end on all environments
[ ] /api/billing/checkout — bearer auth returns user from Core_Eco
[ ] /api/billing/portal  — bearer auth returns user from Core_Eco
[ ] /api/team/*          — cookie auth returns user from Core_Eco
[ ] /api/load-boards/*   — cookie auth returns user from Core_Eco
[ ] NEXT_PUBLIC_CORE_ECO_SUPABASE_URL set in all envs (dev, preview, prod)
[ ] NEXT_PUBLIC_CORE_ECO_ANON_KEY set in all envs
```

**Files to update when removing:**

| File | Change |
|---|---|
| `src/lib/api-auth.ts` | Remove `?? NEXT_PUBLIC_SUPABASE_URL` and `?? ANON_KEY` fallbacks |
| `src/lib/supabase-auth.ts` (if exists) | Same pattern |
| Any other file with `?? process.env.NEXT_PUBLIC_SUPABASE_URL` | Remove fallback chain |

**Do not remove** until all checklist items above are confirmed green in production.

---

## Closed Debt

| ID | Item | Closed |
|---|---|---|
| — | Direct `supabase.from()` calls in Fleet UI pages | 2026-06-07 (Phase 2) |
| — | API routes validating auth against Fleet DB | 2026-06-07 (Phase 1.5) |
| — | `fleet_audit_logs` wrong column names | 2026-06-07 |
