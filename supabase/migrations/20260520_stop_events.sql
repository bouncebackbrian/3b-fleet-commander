-- ============================================================
-- 3B FLEET COMMANDER — stop_events table
-- Phase 4G: Stop Lifecycle + Detention Clock
-- Run in: Fleet Commander Supabase project > SQL Editor
--
-- WHY a separate table (not embedding in metadata.stops):
--   metadata.stops holds the CURRENT lifecycle state — the latest
--   status + timestamps per step. stop_events is the append-only
--   audit trail — every state change gets a row, timestamps are
--   immutable once written, and the payload carries detention
--   evidence that can be exported for broker claims.
--
--   Current state  → metadata.stops (queryable, updatable)
--   History / proof → stop_events   (append-only, exportable)
-- ============================================================

-- ── stop_events ──────────────────────────────────────────────
create table if not exists public.stop_events (
  id            uuid        primary key default gen_random_uuid(),

  -- Links — mission_id is text to match fleet_missions.id cast
  mission_id    text        not null,
  stop_id       text        not null,
  stop_sequence integer,

  -- What happened
  -- Values: arrived | checked_in | waiting | docked |
  --         work_started | work_ended | departed
  event_type    text        not null,

  -- When it happened (driver-reported; not server insert time)
  occurred_at   timestamptz not null default now(),

  -- Structured evidence payload (detention calc, dwell summary, etc.)
  payload       jsonb,

  -- Optional free-text note from the driver
  notes         text,

  -- Identity (nullable — scoped once auth is wired)
  user_id       uuid references auth.users on delete cascade,

  created_at    timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────
-- Primary: list all events for a mission in time order
create index if not exists idx_stop_events_mission
  on public.stop_events(mission_id, occurred_at asc);

-- Secondary: all events for a specific stop
create index if not exists idx_stop_events_stop
  on public.stop_events(stop_id, occurred_at asc);

-- Detention analysis: find all 'departed' events with payload
create index if not exists idx_stop_events_type
  on public.stop_events(event_type, occurred_at desc);

-- ── Row-Level Security ────────────────────────────────────────
-- Permissive-while-anonymous posture (matches fleet_missions).
-- user_id = null rows are accessible to all clients pre-auth.
alter table public.stop_events enable row level security;

drop policy if exists "stop_events_select" on public.stop_events;
create policy "stop_events_select" on public.stop_events
  for select using (user_id is null or auth.uid() = user_id);

drop policy if exists "stop_events_insert" on public.stop_events;
create policy "stop_events_insert" on public.stop_events
  for insert with check (user_id is null or auth.uid() = user_id);

-- stop_events are append-only — no UPDATE or DELETE policies.
-- Detention evidence must not be editable once written.

-- ── event_type constraint ─────────────────────────────────────
-- Run AFTER initial lifecycle test passes (so test rows don't block the ALTER).
-- Closes the gap between text column and the 7 valid lifecycle values.
--
--   alter table public.stop_events
--     add constraint stop_events_event_type_check
--     check (event_type in (
--       'arrived','checked_in','waiting','docked',
--       'work_started','work_ended','departed'
--     ));
