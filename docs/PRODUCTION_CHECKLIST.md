# Fleet Commander — Production Checklist

> **Last updated:** 2026-05-20
> **Live URL:** https://fleet.bouncebackbrian.com
> **Supabase project:** goqzhdrmrdlkchmwfiur
> **GitHub:** bouncebackbrian/3b-fleet-commander
> **Vercel team:** bouncebackbrian

---

## Environment Variables

| Variable | Location | Required | Notes |
|----------|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + `.env.local` | Yes | Project URL from Supabase dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + `.env.local` | Yes | Public anon key — safe to expose |
| `ANTHROPIC_API_KEY` | Vercel only (server) | Yes | Powers `/api/operational-insight` — never expose client-side |
| `NEXT_PUBLIC_APP_ENV` | Optional | No | Set to `production` to suppress debug panel |

**Verify before any deployment:**
- [ ] All env vars set in Vercel → Settings → Environment Variables
- [ ] `ANTHROPIC_API_KEY` is NOT in any `NEXT_PUBLIC_*` variable
- [ ] `.env.local` is in `.gitignore` (never committed)

---

## Supabase Migrations Applied

| Migration | Applied | Description |
|-----------|---------|-------------|
| `fleet_missions_migration.sql` | 2026-05-20 | `mission_status` enum, `fleet_missions` table, updated_at trigger, RLS policies, deactivate-prior trigger |
| `operational_events_migration.sql` | 2026-05-20 | `event_type` + `event_severity` enums, `operational_events` table, RLS policies |

**To verify schema is clean:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**Migration order matters.** `fleet_missions` must be applied before `operational_events` (FK dependency on `mission_id`).

---

## Vercel Deployment Log

| Deploy ID | Date | Commit | Notes |
|-----------|------|--------|-------|
| (check Vercel dashboard) | 2026-05-20 | `f10e5d6` | Phase 2E/2F + 3A/3B — 39 files, 4,197 insertions |
| (check Vercel dashboard) | 2026-05-20 | `c495500` | docs: BUILD_PROMPTS.md |

**Deployment verification checklist:**
- [ ] Vercel build passes (no TypeScript errors)
- [ ] Live URL loads without console errors
- [ ] `/dashboard` renders correctly on desktop
- [ ] `/dashboard` renders on iPad landscape (>= 900px)
- [ ] New Load sheet opens and saves
- [ ] Active Mission card shows with correct data
- [ ] Offline banner appears when network disconnected
- [ ] Toast notifications fire on save/event/error

---

## Rollback Procedure

1. **Vercel rollback** (instant): Vercel dashboard → Deployments → find last good deploy → "Redeploy"
2. **Code rollback**: `git revert <bad-commit>` → push to main → Vercel auto-deploys
3. **Database rollback**: Supabase does NOT auto-rollback. To undo a migration:
   - Write a DOWN migration manually
   - Apply via Supabase SQL editor
   - Document in this file

**Never drop `fleet_missions` or `operational_events` without a data export first.**

---

## API Rate Limits

| Service | Limit | Notes |
|---------|-------|-------|
| Anthropic (claude-opus-4-7) | Tier-dependent | `/api/operational-insight` — driver-triggered, low volume |
| Supabase (free tier) | 500MB DB, 2GB bandwidth/mo | Monitor in Supabase dashboard |
| Vercel (hobby) | 100GB bandwidth/mo | Static + SSR, minimal usage |

**Cost controls:**
- Operational insight calls are 100% driver-triggered (no auto-calls)
- `computeInsights()` is deterministic + free — runs before any AI call
- AI call max_tokens: 200 — hard ceiling prevents runaway costs

---

## Offline Behavior

| Scenario | Expected Behavior |
|----------|------------------|
| No internet on app open | localStorage mission loads, `📴 Offline Mode` banner shows |
| Internet lost mid-session | Banner appears, saves go to localStorage only |
| Supabase URL missing | `local_only` sync state, all data in localStorage |
| Internet restored | Banner hides, next save syncs to Supabase |
| Duplicate event logged | Rejected within 3s, `opLog.guard()` entry written |

**localStorage keys used:**
- `3b-latest-load` — active mission object
- `3b-op-events` — operational events (200 max)
- `3b-hos-event` — last break start/end
- `3b-op-log` — debug log ring buffer (25 entries)

---

## Known Issues

| Issue | Severity | Workaround | Fix Plan |
|-------|----------|------------|----------|
| Schema mismatch: `fleet_missions` column names in production may differ from what `missionToRow()` writes (`gross_rate`, `dispatch_miles`, etc.) | Medium | App falls through to localStorage — data not lost | Run `ALTER TABLE` alignment migration or update `missionToRow()` / `parseFleetMission()` in Phase 4 |
| No auth — all data is anonymous (`user_id IS NULL`) | Expected | RLS policies are permissive for pre-auth state | Phase 4A: Supabase Auth |
| No pagination on operational events | Low | 200-event localStorage cap, 30-event Supabase limit | Phase 4B |

---

## Testing Procedures

### Smoke Test (run after every deployment)
- [ ] Dashboard loads at `/dashboard`
- [ ] New Load → fill all fields → save → mission appears in Active Load card
- [ ] Sync badge shows `✓ synced` (or `📴 local` if Supabase not configured)
- [ ] 📋 Log → select event type → save → toast fires
- [ ] 📊 History → panel opens with insight pills
- [ ] Start Break → modal opens → timer counts → End Break → toast fires
- [ ] Emergency button opens emergency sheet
- [ ] Fuel Stops → fuel planner panel opens

### iPad Validation (physical device preferred)
- [ ] Landscape 1024×768 — sidebar nav visible, cards readable
- [ ] Touch targets ≥ 56px height — no accidental taps
- [ ] Font sizes glanceable at arm's length
- [ ] Quick action bar thumb-reachable
- [ ] Driving Mode overlay activates

### Mobile Validation (375px portrait)
- [ ] No horizontal overflow
- [ ] Cards stack correctly
- [ ] Action buttons readable
- [ ] Offline banner doesn't block content

### Offline Simulation
1. Open DevTools → Network → "Offline"
2. Confirm `📴 Offline Mode` banner appears
3. Save a new load — confirm saves to localStorage
4. Restore network — confirm banner disappears
5. Check Supabase `fleet_missions` — confirm record synced

---

## Debug Access

**Enable debug panel on production:**
1. Open browser console on https://fleet.bouncebackbrian.com
2. Run: `localStorage.setItem('debugMode', 'true')`
3. Reload — `🛠 DBG` button appears bottom-right

**Disable:**
```js
localStorage.removeItem('debugMode')
```

**View operation log:**
```js
JSON.parse(localStorage.getItem('3b-op-log') || '[]')
```
