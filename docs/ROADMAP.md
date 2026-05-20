# Fleet Commander — Roadmap

> Updated: 2026-05-20 | Current: Phase 3B complete

---

## Current State

```
[██████████] Phase 2C — iPad Landscape Command Center       ✅
[██████████] Phase 2D — Operational Action Layer            ✅
[██████████] Phase 2E — Component Extraction                ✅
[██████████] Phase 2F — Supabase Mission Persistence        ✅
[██████████] Phase 3A — Operational Memory System           ✅
[██████████] Phase 3B — Stability & Observability           ✅
```

---

## Phase 4 — Identity & History

### 4A — Driver Auth
**Priority:** HIGH
**Unblocks:** Everything multi-driver, earnings tracking, per-driver data scoping

- Supabase Auth (email/magic link first — no password friction for drivers)
- Populate `user_id` on `fleet_missions` and `operational_events`
- RLS policies auto-tighten: `auth.uid() = user_id`
- Protected routes — redirect `/dashboard` to `/login` if unauthenticated
- Session persistence across page reloads
- Driver profile: name, truck number, home terminal

**Key constraint:** Must not break offline behavior. Auth state cached locally.

---

### 4B — Load History & Earnings Timeline
**Priority:** HIGH
**Requires:** 4A (user_id scoping)

- `fleet_missions` status → `completed` on load close
- Completed loads archive: searchable by date, lane, broker, earnings
- Earnings timeline: weekly/monthly gross, net RPM trends
- Lane performance table: best/worst lanes by net margin
- "Close Load" action on ActiveMissionCard → prompts final odometer, status
- Export: CSV of completed loads for IFTA / accounting

---

### 4C — Real-Time Dispatch Comms
**Priority:** MEDIUM

- Supabase Realtime channels — broker can push load offers
- Message log: time-stamped broker ↔ driver thread per load
- Load offer push notification (PWA push, Phase 4E dependency)
- "Accept / Counter / Decline" actions on incoming offers
- Rate negotiation history attached to load record

---

### 4D — Expanded AI Layer
**Priority:** MEDIUM
**Requires:** Sufficient event history (3A data accumulation)

- Auto-insight generation on load save (if lane has history > 5 events)
- Route risk scoring: combine weather + lane history + traffic patterns
- Lane trend forecasting: "This lane's detention rate is rising"
- Rate intelligence: "Last 3 loads on this lane cleared $2.18/mi — current offer is $1.89"
- Load comparison: score multiple offers side-by-side
- Upgrade from claude-opus-4-7 to next best model as appropriate

---

### 4E — Offline-First PWA Hardening
**Priority:** MEDIUM (HIGH if driver operates in low-signal areas)

- Service worker: cache all static assets + API routes
- Background sync: queue failed Supabase writes, retry on reconnect
- Conflict resolution strategy: last-write-wins with timestamp comparison
- Web push notifications: break timer end, HOS limit warnings
- App install prompt: "Add Fleet Commander to Home Screen"
- Manifest: icon, splash screen, display: standalone

---

## Phase 5 — Fleet Intelligence

### 5A — Multi-Driver Fleet View
**Requires:** 4A + 4C

- Fleet owner dashboard: all drivers, current loads, status
- Driver location pings (opt-in, privacy-first)
- Dispatcher → driver load assignment flow
- Fleet-wide lane intelligence: aggregate insights across all drivers

---

### 5B — Fuel Optimization Engine
**Priority:** HIGH value (direct cost savings)

- Real fuel price API integration (GasBuddy / OPIS / DAT)
- Optimal fuel stop calculator: price vs. detour tradeoff
- Reefer fuel tracking: separate from tractor fuel
- Fuel card integration (Comdata / EFS) — read transaction history
- Fuel cost actuals vs. estimates: track accuracy over time

---

### 5C — Route Intelligence
- Weigh station alerts (Drivewyze/PrePass integration)
- Low clearance / permit route warnings
- Scale backup predictions from `scale_issue` event history
- Parking reservation integration (Trucker Path)
- Geofenced arrival detection → auto-log `arrived_pickup` / `arrived_delivery`

---

### 5D — Voice Workflow Layer
**Current state:** Voice action placeholders exist (VoicePanel.tsx)

- Web Speech API integration (no third-party dependency)
- Commands: "Log receiver delay" / "Start break" / "Mark arrived" / "Call dispatch"
- Audio feedback: TTS confirmation of logged actions
- Hands-free mode for active driving (trigger by voice wake word)

---

### 5E — Driver Profiles & Preferences
- Equipment profile: truck number, trailer type, weight limits, endorsements
- Preferred lanes / avoided lanes
- Home terminal / radius preferences
- Rate floor settings: auto-flag loads below threshold
- Notification preferences

---

## Non-Negotiable Principles (all phases)

1. **Offline always works.** Every phase must degrade gracefully without network.
2. **Driver safety first.** No feature requiring eyes off road while moving.
3. **localStorage before Supabase.** Write order never reverses.
4. **Deterministic before AI.** Free insights always show; AI is the enhancement layer.
5. **No breaking changes to existing localStorage keys** without migration path.
6. **TypeScript strict clean** on every commit.

---

## Deferred / Parking Lot

| Idea | Why Deferred |
|------|-------------|
| ELD integration (Samsara, KeepTruckin) | API cost + complexity — Phase 5+ |
| Load board scraping (DAT, Truckstop) | TOS risk — needs official API deal |
| Factoring integration | Requires auth + financial data handling |
| Two-way broker TMS integration | Broker-side complexity — Phase 5+ |
| Native mobile app (React Native) | PWA covers 95% of need at 0 app store friction |
