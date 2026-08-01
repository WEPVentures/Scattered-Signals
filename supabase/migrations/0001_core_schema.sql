-- Scattered Signals: core schema
-- Categories, signals, the story-arc (signal_updates), evidence, and the
-- append-only confidence history that drives the chart and (later) velocity.

create extension if not exists "pgcrypto";

create table categories (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  label         text not null,
  sort_order    int not null default 0
);

create type signal_type as enum ('trend', 'claim');
create type confidence_level as enum ('low', 'moderate', 'high', 'collapsed');
create type velocity_direction as enum ('rising', 'falling', 'steady');
create type claim_status as enum ('pending', 'resolved');
create type claim_outcome as enum ('hit', 'missed', 'partial');
create type publish_status as enum ('draft', 'published', 'archived');
create type evidence_tier as enum ('1', '2', '3');
create type evidence_direction as enum ('supports', 'contradicts');

create table signals (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text unique not null,
  title                 text not null,
  category_id           uuid not null references categories(id),
  type                  signal_type not null,
  is_top                boolean not null default false,

  -- denormalized current state, refreshed whenever a new signal_update or
  -- confidence_snapshot is written; lets the homepage list and filter
  -- render without joining the whole story arc every time
  confidence            confidence_level not null default 'low',
  velocity              velocity_direction not null default 'steady',
  velocity_is_manual_override boolean not null default false,

  -- claim-only fields (type = 'claim'); null for trends
  claim_text            text,
  claim_resolves_around text,
  claim_status          claim_status,
  claim_outcome         claim_outcome,
  claim_resolution_note text,
  claim_resolved_at     timestamptz,

  status                publish_status not null default 'draft',
  published_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index signals_status_top_idx on signals (status, is_top);
create index signals_category_idx on signals (category_id);

-- The story arc: one row per narrative snapshot. published_at is the
-- cutoff used to compute "evidence as of this update" (see packages/core).
create table signal_updates (
  id                      uuid primary key default gen_random_uuid(),
  signal_id               uuid not null references signals(id) on delete cascade,
  sequence                int not null,
  eyebrow_label            text not null,
  published_at             timestamptz not null,
  body_copy                text not null,
  watching_text             text,

  -- state as understood at this point, for reproducing historical views
  confidence_at_time        confidence_level not null,
  velocity_at_time           velocity_direction not null,
  claim_status_at_time        claim_status,
  claim_outcome_at_time        claim_outcome,
  claim_resolution_note_at_time text,

  is_current                boolean not null default false,
  created_at                 timestamptz not null default now(),

  unique (signal_id, sequence)
);

create unique index one_current_update_per_signal
  on signal_updates (signal_id) where is_current;

create table evidence (
  id            uuid primary key default gen_random_uuid(),
  signal_id     uuid not null references signals(id) on delete cascade,
  tier          evidence_tier not null,
  direction     evidence_direction not null,
  cluster_no    int not null,
  source_name   text not null,
  source_url    text,
  description   text not null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  created_by    text
);

create index evidence_signal_created_idx on evidence (signal_id, created_at);

-- Append-only. One row per human confidence-setting event. Drives the
-- Confidence Over Time chart and the future deriveVelocity() logic.
create table confidence_snapshots (
  id                uuid primary key default gen_random_uuid(),
  signal_id         uuid not null references signals(id) on delete cascade,
  confidence        confidence_level not null,
  note              text,
  recorded_at       timestamptz not null default now(),
  recorded_by       text,
  signal_update_id  uuid references signal_updates(id)
);

create index confidence_snapshots_signal_idx on confidence_snapshots (signal_id, recorded_at);

-- seed the three existing categories
insert into categories (slug, label, sort_order) values
  ('automotive', 'Automotive', 1),
  ('consumer', 'Consumer', 2),
  ('culture-policy', 'Culture & Policy', 3);
