# Fleet Commander — Current Status

> Last updated: 2026-06-07

---

## Phase Status

| Phase | Description | Status |
|---|---|---|
| **Phase 1** | Auth split — Core_Eco auth, Fleet DB data | ✅ Complete |
| **Phase 1.5** | Auth fix — `api-auth.ts`, all routes use Core_Eco | ✅ Complete |
| **Phase 2** | Fleet API service layer + UI refactor | ✅ Complete — pending smoke test |
| **Phase 3** | — | Not started |

---

## Architecture (current)

```
Browser
  ↓
Core_Eco (rkwdryneutgyqrnbuwaz)   ← auth / identity SOR
  ↓ cookie session
/api/fleet/*                       ← Next.js API routes (server)
  ↓ requireFleetAuth()
/lib/fleet/*                       ← service layer (service-role)
  ↓
Fleet DB (goqzhdrmrdlkchmwfiur)    ← all fleet data
  ↓ fire-and-forget
fleet_audit_logs                   ← immutable audit trail
```

---

## Production Smoke Test Checklist

Run after deploy. Do not skip `fleet_audit_logs` verification.

```
Fuel
  [ ] Create fuel entry
  [ ] Toggle receipt saved
  [ ] Delete fuel entry

Delays
  [ ] Create delay entry
  [ ] Toggle dispatcher notified
  [ ] Delete delay entry

Loads
  [ ] Create load
  [ ] Update load (any field)
  [ ] Delete load

Dashboard
  [ ] Load MIS page — loads + fuel both render
  [ ] Load audit page — loads render, verify/unmark works

Audit log
  [ ] Confirm fleet_audit_logs rows created for each mutation above
  [ ] Check actor_user_id, action, before_state/after_state populated correctly
```

---

## Active Tech Debt

See `DEBT_REGISTER.md` for full register.

| ID | Item | Priority |
|---|---|---|
| DEBT-001 | `fleet_load_board_cache` RLS | High — security |
| DEBT-002 | Fleet DB auth fallback in `api-auth.ts` | Medium — after smoke test pass |

---

## What Hasn't Changed

- `settings/page.tsx` — still calls `profiles` and `driver_compliance` via anon Supabase. Not fleet data. Out of Phase 2 scope.
- Load boards — `src/app/api/load-boards/*` — auth fixed in Phase 1.5, data layer not yet in fleet service layer. Not in scope.
