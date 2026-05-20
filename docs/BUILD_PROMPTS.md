# 🚛 Fleet Commander — Alpha Build Prompt Stack

> **Purpose:** Recreate, reuse, document, hand to Claude, onboard devs, or build Phase 4 cleanly.
> **Commit:** `f10e5d6` — Phase 2E/2F + 3A/3B (39 files, 4,197 insertions)
> **Live:** https://fleet.bouncebackbrian.com

---

## Phase Overview

| Phase | Task | Goal | Status |
|-------|------|------|--------|
| 2C | iPad Landscape Command Center | Readability pass for in-cab iPad use | ✅ |
| 2D | Operational Action Layer | Dashboard → execution system | ✅ |
| 2E | Component Extraction | Modularize 1,431-line page.tsx | ✅ |
| 2F | Supabase Mission Persistence | Move mission state to cloud | ✅ |
| 3A | Operational Memory System | Lane history + AI insights | ✅ |
| 3B | Stability & Observability | Logger, guards, toast, sync | ✅ |

---

## Prompt 1 — iPad Landscape Command Center

**Phase 2 Task 2C — iPad Landscape Command Center Readability Pass**

**Goal:**
Redesign the Command Center for iPad landscape in-cab use. The current UI is too dense and cramped. This pass is about readability, safety, and fast button pushes — not adding new features.

**Primary device:** iPad landscape mounted in truck cab.

**Do NOT** add new features.
**Do NOT** change fuel scoring logic.
**Do NOT** change scoreLoad.ts unless required for display typing.
**Do NOT** rebuild the whole app.

**Target files:**
- `src/app/dashboard/page.tsx`
- shared dashboard/card components if they exist
- CSS/Tailwind classes used by dashboard layout only

**Requirements:**

1. Create an iPad landscape layout for widths >= 900px.
2. Use a left sidebar nav on landscape.
3. Use large touch targets: minimum 56px height, preferred 72px for key actions.
4. Reduce visible dashboard cards to only:
   - Active Load
   - ETA / Location
   - HOS Status
   - Fuel Status
   - Weather
   - Alerts / Messages
5. Move non-critical items lower or behind buttons.
6. Top quick action bar must include:
   - New Load
   - Start Break
   - Check HOS
   - Fuel Stops
   - Scan Docs
   - Emergency
7. Increase font sizes for driving readability:
   - main numbers: 40–56px
   - card titles: 18–22px
   - button labels: 16–20px
8. Add a clear "Driving Mode" visual state.
9. Make all important buttons thumb-friendly.
10. Keep phone portrait usable, but simplified.

**Return:**
- updated responsive layout plan
- component structure
- breakpoint strategy
- first implementation code for Command Center page

---

## Prompt 2 — Operational Action Layer

**Phase 2 Task 2D — Operational Action Layer**

**Goal:**
Transform the Command Center from a passive dashboard into an operational execution system.

**Do NOT** redesign layout again.
Use the new iPad landscape structure already completed.

**Focus:** Fast operational workflows with minimal taps.

**Requirements:**

1. Quick Action Buttons must perform real workflows:
   - New Load → opens intake modal/sheet
   - Start Break → starts break timer + updates HOS state
   - Check HOS → expands compact HOS detail drawer
   - Fuel Stops → opens fuel planner panel
   - Scan Docs → opens camera/file upload flow
   - Emergency → opens emergency action sheet

2. Add persistent "Active Mission" state:
   - current load #
   - pickup / dropoff / ETA
   - HOS remaining
   - fuel remaining
   - weather risk

3. Add "Mission Focus Mode" — simplified operational screen for active driving.

4. Add voice-action placeholders:
   - Call Dispatch
   - Navigate
   - Mark Arrived
   - Start Break

5. Add operational alert priorities.

**Return:**
- updated dashboard logic
- state structure
- new components
- mobile + iPad behavior notes
- mock operational flows

---

## Prompt 3 — Dashboard Component Extraction

**Phase 2 Task 2E — Dashboard Component Extraction**

**Goal:**
Refactor `dashboard/page.tsx` into modular production-ready components **WITHOUT** changing behavior or UI.

**Requirements:**

Create component structure:
```
components/dashboard/
components/dashboard/cards/
components/dashboard/sheets/
components/dashboard/overlays/
components/dashboard/actions/
```

Suggested extraction targets:
- `ActiveMissionCard`
- `HosCard`
- `FuelWeatherRow`
- `AlertsCard`
- `QuickNavCard`
- `VoicePanel`
- `EmergencySheet`
- `BreakTimerModal`
- `FuelPlanSheet`
- `HosDetailSheet`
- `DocsSheet`
- `DrivingModeOverlay`
- `NewLoadSheet`
- `ActiveTripCard`
- `StatusBar`
- `HOSBar` (shared)

Move reusable utility logic into:
- `hooks/` — `useMission`, `useWeather`, `useBreakTimer`
- `lib/dashboard/` — `types.ts`, `helpers.ts`

**Keep:**
- TypeScript strict clean
- current behavior identical
- current styles identical
- all breakpoints intact

**Return:**
- new folder structure
- extracted component list
- updated imports
- final dashboard/page.tsx line count
- any shared types created

---

## Prompt 4 — Supabase Mission Persistence

**Phase 2 Task 2F — Supabase Mission Persistence**

**Goal:**
Move active mission/load state from localStorage-only into Supabase while keeping localStorage as offline fallback.

**Do NOT** redesign UI.
**Do NOT** change dashboard layout.
**Do NOT** add new features.

**Build:**

1. Supabase table for fleet missions / active loads
2. Save `NewLoadSheet` submissions to Supabase
3. Load active mission on dashboard load
4. Keep localStorage fallback if Supabase is unavailable
5. Add `created_at` / `updated_at` timestamps
6. Add status: `planned | active | completed | cancelled`
7. Add `user_id` and `business_id` fields — nullable for now
8. Add basic error states without breaking UI

**SQL objects created:**
- `public.mission_status` enum
- `public.fleet_missions` table
- `trg_fleet_missions_updated_at` trigger
- `deactivate_prior_missions_on_insert` trigger (server-side single-active enforcement)
- 4 RLS policies (permissive while `user_id IS NULL`)

**Return:**
- SQL migration
- updated Supabase client usage
- files changed
- testing checklist

---

## Prompt 5 — Operational Memory System

**Phase 3 Task 3A — Operational Memory System**

**Goal:**
Fleet Commander should remember operational history and use it to improve future dispatch decisions.

**Build:**

1. Create `operational_events` table in Supabase

   Event types:
   - `detention` · `weather_delay` · `fuel_issue` · `receiver_delay` · `parking_issue`
   - `breakdown` · `route_problem` · `successful_delivery` · `scale_issue` · `traffic_delay`

   Severity: `info | warn | critical`

2. Add "Log Event" quick action to active mission card (📋 Log button)

3. Add quick-preset buttons (6 in 3-col grid):
   - Receiver Delay · Parking Full · Heavy Traffic
   - Reefer Fuel · Scale Backup · Weather Delay

4. Add "More types" toggle:
   - Detention · Breakdown · Route Problem · Clean Delivery

5. Add Mission History panel showing:
   - prior lane events
   - detention patterns
   - recurring receiver delays
   - operational notes

6. Add operational insights (deterministic, no API cost):
   - "Receiver delayed 3x on this lane"
   - "Parking difficult — arrive early"
   - "⚖️ Scale backup reported 2x — add 30-min buffer"
   - "✅ Strong lane — 4 clean deliveries, no issues"

7. Add AI summary generation:
   - "✨ Generate" button in history panel
   - Calls `claude-opus-4-7` via `/api/operational-insight`
   - System: seasoned dispatcher sticky note voice, max 3 sentences, no bullet points

**Key design decisions:**
- `normLane(s)` strips state suffix + lowercases for cross-run lane matching
- `computeInsights()` is pure/deterministic — zero API cost, always available
- `logEvent()` writes localStorage first, then Supabase async
- Duplicate event protection: same type rejected within 3s

**Return:**
- SQL migration
- files changed
- new components
- Supabase queries
- operational insight generation logic
- testing checklist

---

## Prompt 6 — Stability & Observability Layer

**Phase 3 Task 3B — Stability & Observability Layer**

**Goal:**
Harden Fleet Commander operational workflows before adding additional intelligence systems.

**Do NOT** redesign UI.
**Do NOT** add new business features.
**Do NOT** expand AI functionality yet.

**Build:**

1. **Global operational logger** (`src/lib/logger.ts`)

   Track:
   - mission saves
   - event logs
   - break timer start/stop
   - fuel calculations
   - HOS scans
   - AI insight requests
   - Supabase sync failures

   Structure: `{ id, ts, level, category, message, data? }`
   Storage: ring buffer (100 in-memory, 25 in localStorage `3b-op-log`)
   Categories: `mission | event | break | fuel | hos | ai | sync | render | guard`

2. **Lightweight debug panel** (`src/components/debug/DebugPanel.tsx`)

   Visible only when:
   - `NODE_ENV !== 'production'`
   - OR `localStorage.debugMode === 'true'`

   Shows: active mission state, sync state, Supabase connection, recent op events, break timer, fuel calc summary, live log tail

3. **Sync status indicators** on `ActiveMissionCard`:
   - `📴 local` — Supabase not configured
   - `⟳ saving` — write in flight
   - `✓ synced` — last write succeeded (fades after 3s)
   - `⚠ failed` — last write failed

4. **Stale-state protection:**
   - Duplicate active missions → server trigger (`deactivate_prior_missions_on_insert`)
   - Duplicate break timers → `breakActive` ref guard
   - Repeated event submissions → same type rejected within 3s (`lastEventRef`)
   - Rapid saves → 500ms debounce + `saveInProgress` concurrent lock

5. **Runtime guards** (`src/lib/guards.ts`):
   - `validateMission()` — missing id, origin, destination; NaN miles/rate/fuel
   - `validateHOS()` — NaN + out-of-range drive/shift/cycle hours
   - `isScoreResultSafe()` — NaN in score, netRpm, netMargin, fuelCost
   - `isFuelResultSafe()` — NaN in gallonsNeeded, fuelCostTotal, priceUsed, totalMiles

6. **Centralized toast system** (`src/hooks/useToast.ts`):
   - Module-level singleton — callable from any hook without React context
   - Types: `success | warn | error | sync_failed | offline`
   - `toast.success()` · `toast.warn()` · `toast.error()` · `toast.syncFailed()` · `toast.offline()`

7. **Offline banner** (`src/components/shared/OfflineBanner.tsx`):
   - `"📴 Offline Mode — changes saving locally"`
   - Fixed top, z-index 400, only visible when `!isOnline`
   - `useOnlineStatus()` hook wraps `navigator.onLine` + window events

8. **Performance guard:**
   - `_renderTs` ref captures `performance.now()` at render start
   - `useEffect()` (no deps) measures and logs if >100ms
   - Dev only, `opLog.render(...)` category

**Return:**
- files created
- files modified
- logging structure
- state guard strategy
- testing checklist

---

## Architecture Reference

### File Tree (Phase 2E–3B)

```
src/
├── app/
│   ├── api/
│   │   └── operational-insight/route.ts   ← claude-opus-4-7 dispatcher insight
│   └── dashboard/
│       └── page.tsx                        ← 451 lines (was 1,431)
├── components/
│   ├── dashboard/
│   │   ├── actions/StatusBar.tsx
│   │   ├── cards/
│   │   │   ├── ActiveMissionCard.tsx       ← Log/History buttons, sync badge, insight pills
│   │   │   ├── ActiveTripCard.tsx
│   │   │   ├── AlertsCard.tsx
│   │   │   ├── ExpensesCard.tsx
│   │   │   ├── FuelWeatherRow.tsx
│   │   │   ├── HosCard.tsx
│   │   │   └── QuickNavCard.tsx
│   │   ├── overlays/
│   │   │   ├── BreakTimerModal.tsx
│   │   │   ├── DrivingModeOverlay.tsx
│   │   │   └── EmergencySheet.tsx
│   │   ├── panels/
│   │   │   └── MissionHistoryPanel.tsx     ← Lane history + AI insight
│   │   ├── shared/HOSBar.tsx
│   │   └── sheets/
│   │       ├── DocsSheet.tsx
│   │       ├── FuelPlanSheet.tsx
│   │       ├── HosDetailSheet.tsx
│   │       ├── LogEventSheet.tsx           ← 6 presets + more types
│   │       ├── NewLoadSheet.tsx
│   │       └── VoicePanel.tsx
│   ├── debug/
│   │   └── DebugPanel.tsx                  ← dev-only, 🛠 DBG toggle
│   └── shared/
│       ├── OfflineBanner.tsx
│       └── ToastContainer.tsx
├── hooks/
│   ├── useBreakTimer.ts                    ← epoch-based, logger, toasts
│   ├── useMission.ts                       ← 3-tier fetch, syncState, guards, debounce
│   ├── useOnlineStatus.ts                  ← navigator.onLine + events
│   ├── useOperationalMemory.ts             ← logEvent, computeInsights, generateInsight
│   ├── useToast.ts                         ← module-level singleton
│   └── useWeather.ts
└── lib/
    ├── dashboard/
    │   ├── helpers.ts                      ← parseMission, parseFleetMission, missionToRow
    │   └── types.ts                        ← all shared types incl. SyncState, EventType
    ├── guards.ts                           ← validateMission, validateHOS, NaN sweeps
    └── logger.ts                           ← opLog singleton, ring buffer, subscribeToLog

supabase/
├── fleet_missions_migration.sql
└── operational_events_migration.sql
```

### Supabase Tables

| Table | Key Fields | Notes |
|-------|-----------|-------|
| `loads` | id, load_number, notes (META-encoded) | Pre-existing, not modified |
| `fleet_missions` | id, mission_status, origin, destination, metadata | New in 2F |
| `operational_events` | id, mission_id, event_type, severity, origin, destination | New in 3A |

### Data Flow

```
NewLoadSheet submit
  → localStorage.setItem('3b-latest-load')   [instant, offline-safe]
  → setMission() optimistic UI               [instant]
  → supabase.fleet_missions.upsert()         [async, non-blocking]
  → setSyncState('saved' | 'failed')

LogEventSheet save
  → localStorage.setItem('3b-op-events')     [instant]
  → setEvents() optimistic UI               [instant]
  → supabase.operational_events.insert()    [async]
  → toast.success('Event logged')

Dashboard load
  → fetchActiveMission():
      Tier 1: fleet_missions (active/planned)
      Tier 2: loads table (legacy META)
      Tier 3: localStorage '3b-latest-load'
```

### Z-Index Stack

```
Bottom bar / cards    → default flow
Sheets / backdrops    → 200 / 201
Toast container       → 300
Offline banner        → 400
Debug panel           → 499 / 500
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `normLane(s)` strips state suffix | "Dallas, TX" and "dallas" match the same lane history |
| `computeInsights()` is pure/sync | Zero API cost, instant, always available offline |
| localStorage writes before Supabase | Driver data is never lost; cloud is async bonus |
| `user_id IS NULL` permissive RLS | App works pre-auth; automatically scopes when auth wires in |
| Separate `fleet_missions` from `loads` | `loads` is accounting; `fleet_missions` is operational state |
| `deactivate_prior_missions` trigger | Server-side enforcement — no client race conditions |
| Module-level toast singleton | Callable from hooks without prop-drilling or context |
| `SyncState` on `ActiveMissionCard` | Driver sees cloud sync status at a glance |

---

## What's Next — Phase 4 Candidates

- **4A** — Driver Auth (Supabase Auth, `user_id` population, per-driver data scoping)
- **4B** — Multi-load / Load History (completed missions archive, earnings timeline)
- **4C** — Real-time dispatch comms (Supabase Realtime channels, broker message log)
- **4D** — Expanded AI layer (route risk scoring, lane trend forecasting, auto-insights on load save)
- **4E** — Offline-first PWA hardening (background sync, conflict resolution, service worker events)
