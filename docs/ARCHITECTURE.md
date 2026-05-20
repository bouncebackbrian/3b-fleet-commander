# Fleet Commander — Architecture

> Phase 3B baseline. Updated as the system grows.

---

## System Overview

```
Driver (iPad / Phone)
        │
        ▼
  Next.js 15 App Router          ← Vercel edge / Node runtime
  /dashboard (client component)
        │
        ├── useMission()          ← 3-tier fetch, sync state, guards, debounce
        ├── useOperationalMemory()← lane history, event logging, AI insights
        ├── useBreakTimer()       ← epoch-based, HOS-safe timer
        ├── useWeather()          ← weather risk display
        └── useToast()            ← module-level singleton, no context needed
        │
        ├──[UI Layer]─────────────────────────────────────────────────────────
        │   ActiveMissionCard     ← route, score, sync badge, insight pills
        │   HosCard               ← drive/shift/cycle display
        │   FuelWeatherRow        ← fuel intel + weather risk
        │   AlertsCard            ← operational alerts
        │   MissionHistoryPanel   ← lane history, AI insight generation
        │   LogEventSheet         ← 6 presets + more types
        │   NewLoadSheet          ← mission intake
        │   BreakTimerModal       ← 30-min HOS break clock
        │   DrivingModeOverlay    ← simplified in-motion screen
        │   OfflineBanner         ← fixed top, z-400
        │   ToastContainer        ← z-300, auto-dismiss
        │   DebugPanel            ← dev/debug only, z-500
        │
        └──[API Route]────────────────────────────────────────────────────────
            /api/operational-insight  ← Server: claude-opus-4-7, max 200 tokens
        │
        ▼
  Supabase (PostgreSQL + RLS)
        ├── fleet_missions        ← active operational state
        └── operational_events    ← lane history, event log
        │
  localStorage (offline fallback)
        ├── 3b-latest-load        ← active mission
        ├── 3b-op-events          ← event buffer (200 max)
        ├── 3b-hos-event          ← last break record
        └── 3b-op-log             ← debug ring buffer (25)
```

---

## Frontend Architecture

### Stack
- **Next.js 15** App Router — `src/app/`
- **TypeScript** strict mode
- **Tailwind CSS** for utility classes; inline styles for dynamic/component-level values
- **Supabase JS client** (`@supabase/supabase-js`) — nullable, handles missing env vars gracefully

### Component Hierarchy

```
app/dashboard/page.tsx              ← orchestrator, 451 lines
├── hooks/ (all state lives here)
│   ├── useMission                  ← mission CRUD, score, fuel intel, sync state
│   ├── useOperationalMemory        ← events, history, insights, AI generation
│   ├── useBreakTimer               ← timer state
│   ├── useWeather                  ← weather fetch
│   ├── useOnlineStatus             ← navigator.onLine + window events
│   └── useToast                    ← subscribe to module singleton
│
├── components/dashboard/
│   ├── cards/                      ← display cards (read-heavy)
│   ├── sheets/                     ← action sheets (write-heavy, z:200/201)
│   ├── overlays/                   ← full-screen modal overlays
│   ├── panels/                     ← side/bottom panels
│   └── shared/                     ← HOSBar, shared primitives
│
├── components/shared/
│   ├── OfflineBanner               ← network state indicator
│   └── ToastContainer              ← toast renderer
│
└── components/debug/
    └── DebugPanel                  ← dev visibility tool
```

### State Architecture

All mission + event state lives in **hooks, not components**. Components receive state via props and call handler callbacks. No prop-drilling beyond one level — `page.tsx` is the single orchestrator.

```
page.tsx
  │  useMission() → { mission, missionScore, missionFuel, syncState, saveMission }
  │  useOperationalMemory(mission) → { events, history, insights, aiInsight, logEvent, generateInsight }
  │  useBreakTimer() → { breakActive, breakSecs, handleStartBreak, handleEndBreak }
  │
  └── passes as props to child components
```

### Singleton Modules

Two module-level singletons exist outside React:

**`src/lib/logger.ts` — `opLog`**
- Ring buffer: 100 in-memory, 25 in localStorage
- Callable from hooks without React context
- Dev console output gated to `NODE_ENV !== 'production'`
- `subscribeToLog(fn)` powers DebugPanel live tail

**`src/hooks/useToast.ts` — `toast`**
- `_toasts[]` array + `_listeners Set` at module scope
- `toast.success/warn/error/syncFailed/offline()` callable anywhere
- React components subscribe via `useToasts()` hook
- Auto-dismiss via `setTimeout`

---

## Data Layer

### Mission Data Flow

```
NewLoadSheet submit
  ↓
localStorage.setItem('3b-latest-load')   ← synchronous, always succeeds
  ↓
setMission() optimistic update           ← immediate UI
  ↓
setSyncState('saving')                   ← visual feedback
  ↓
supabase.fleet_missions.upsert()         ← async, non-blocking
  ↓
setSyncState('saved' | 'failed')         ← 3s auto-reset to 'idle'
```

### Event Data Flow

```
LogEventSheet save
  ↓
Duplicate guard check (lastEventRef — reject same type within 3s)
  ↓
localStorage.setItem('3b-op-events')     ← synchronous
  ↓
setEvents() optimistic update
  ↓
toast.success('Event logged: ...')
  ↓
supabase.operational_events.insert()    ← async
```

### Dashboard Load / 3-Tier Fetch

```
Page mount → fetchActiveMission()
  ↓
Tier 1: supabase.fleet_missions (status: active | planned)
  → success → parseFletMission() → setMission()
  ↓ (if no result)
Tier 2: supabase.loads (legacy, META-encoded notes field)
  → success → parseMission() → setMission()
  ↓ (if no result or Supabase unavailable)
Tier 3: localStorage.getItem('3b-latest-load')
  → success → JSON.parse → setMission()
```

### Supabase Schema

**`fleet_missions`**
```sql
id              uuid PRIMARY KEY
mission_status  mission_status  -- planned | active | completed | cancelled
origin          text
destination     text
metadata        jsonb           -- flexible field bag
user_id         uuid NULLABLE   -- for Phase 4A auth
business_id     uuid NULLABLE
created_at      timestamptz
updated_at      timestamptz     -- auto-updated by trigger
```

**`operational_events`**
```sql
id              uuid PRIMARY KEY
mission_id      uuid REFERENCES fleet_missions(id)
load_number     text
origin          text            -- normLane() normalized
destination     text            -- normLane() normalized
event_type      event_type      -- detention | weather_delay | fuel_issue | ...
severity        event_severity  -- info | warn | critical
notes           text NULLABLE
location        text NULLABLE
created_by      uuid NULLABLE
created_at      timestamptz
```

**RLS Strategy:**
All tables use permissive policies while `user_id IS NULL`. When Phase 4A ships Supabase Auth, policies switch to `auth.uid() = user_id` automatically — no RLS rewrite needed.

---

## Offline Strategy

**Principle:** Driver data is never lost. Cloud sync is an async bonus.

1. Every write hits localStorage first (synchronous, works offline)
2. Supabase writes are fire-and-forget with error capture
3. `SyncState` gives the driver real-time feedback: `📴 local | ⟳ saving | ✓ synced | ⚠ failed`
4. On offline detection: `OfflineBanner` appears, toast fires once (transition-only, via `prevOnline` ref)
5. No conflict resolution yet — last write wins (acceptable for single-driver pre-auth state)

---

## Guard & Validation Layer

**`src/lib/guards.ts`** — pure functions, zero side effects

```
validateMission(m)    → string[]  errors (missing id, origin, dest, NaN values)
validateHOS(h)        → string[]  errors (NaN, out-of-range drive/shift/cycle hours)
isFuelResultSafe(r)   → boolean   (NaN check: gallons, cost, price, miles)
isScoreResultSafe(r)  → boolean   (NaN check: score, netRpm, netMargin, fuelCost)
hasNaNValues(obj)     → boolean   (recursive NaN sweep for any Record)
```

Guards log via `opLog.guard()` but never throw — the app degrades gracefully.

---

## Performance Guards

**Render timing** (dev only):
```tsx
const _renderTs = useRef<number>(0)
_renderTs.current = performance.now()   // synchronous, before JSX
useEffect(() => {                        // after commit
  const ms = performance.now() - _renderTs.current
  if (ms > 100) opLog.render(`Slow render: ${ms.toFixed(1)}ms`)
})  // no deps = every render
```

**Save debounce:** 500ms minimum between Supabase writes (`lastSaveMs` ref)
**Concurrent save lock:** `saveInProgress` ref prevents overlapping writes
**Duplicate event guard:** `lastEventRef` rejects same event type within 3s

---

## Z-Index Stack

```
Normal document flow      → default
Sheet backdrops           → 200
Sheet content             → 201
Toast container           → 300
Offline banner            → 400
Debug panel backdrop      → 499
Debug panel content       → 500
```

---

## AI Integration

**Endpoint:** `POST /api/operational-insight`
**Model:** `claude-opus-4-7`
**Max tokens:** 200
**When called:** Only on explicit driver tap of ✨ Generate button
**System prompt voice:** Seasoned dispatcher sticky note — 3 sentences max, no bullets

**Input to API:**
```json
{
  "mission": { ...LoadMission },
  "events":  [ ...OperationalEvent[] ],   // current run
  "history": [ ...OperationalEvent[] ]    // prior lanes
}
```

**Free alternative:** `computeInsights()` in `useOperationalMemory.ts` — deterministic, zero cost, always runs before AI call. Shows in ActiveMissionCard insight pills automatically.

---

## Breakpoint Strategy

| Width | Layout |
|-------|--------|
| `< 768px` | Mobile portrait — single column, simplified |
| `768–899px` | Tablet portrait — medium density |
| `>= 900px` | iPad landscape — sidebar nav, 2-column grid |
| `>= 1200px` | Desktop — full command center layout |

Key breakpoint in CSS: `@media (min-width: 900px)` for iPad landscape sidebar.
