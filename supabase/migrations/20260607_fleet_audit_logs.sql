-- fleet_audit_logs — immutable audit trail for Fleet Commander mutations
-- ADR-006: every create/update/delete through /api/fleet/* writes here.
-- Service-role only — RLS enabled, no anon policies.
--
-- Applied: 2026-06-07 to goqzhdrmrdlkchmwfiur (Fleet DB)
-- Note: table was pre-created by Phase 2 session with old names.
--       This migration documents the canonical schema after column renames.

-- Create (idempotent — no-op if table already exists with final schema)
create table if not exists public.fleet_audit_logs (
  id            uuid        primary key default gen_random_uuid(),
  actor_user_id uuid,                                           -- Core_Eco user UUID (nullable: system actions)
  actor_3b_id   text,                                           -- future: 3B ecosystem ID
  actor_email   text,                                           -- denormalised for readability
  action        text        not null,                           -- e.g. 'load.create' | 'fuel.delete'
  resource_type text        not null,                           -- table / domain noun
  resource_id   uuid,                                           -- affected row UUID
  before_state  jsonb,                                          -- snapshot before UPDATE/DELETE
  after_state   jsonb,                                          -- snapshot after CREATE/UPDATE
  metadata      jsonb       not null default '{}'::jsonb,
  source        text        not null default 'api',             -- 'api' | 'admin' | 'system'
  created_at    timestamptz not null default now()
);

alter table public.fleet_audit_logs enable row level security;

-- Performance indexes
create index if not exists fleet_audit_logs_actor_idx
  on public.fleet_audit_logs (actor_user_id);

create index if not exists fleet_audit_logs_resource_idx
  on public.fleet_audit_logs (resource_type, resource_id);

create index if not exists fleet_audit_logs_created_idx
  on public.fleet_audit_logs (created_at desc);
