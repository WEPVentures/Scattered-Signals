-- Scattered Signals: AI research pipeline
-- Everything here is a proposal pending human review. Nothing here can
-- become a real `signals` row without going through the approval step
-- (see dashboard/netlify/functions/approve-draft.ts).

create type topic_status as enum ('queued', 'researching', 'draft_ready', 'failed', 'archived');
create type draft_status as enum ('pending_review', 'edited', 'approved', 'rejected');

create table research_topics (
  id             uuid primary key default gen_random_uuid(),
  topic_text     text not null,
  notes          text,
  category_hint  uuid references categories(id),
  type_hint      signal_type,
  status         topic_status not null default 'queued',
  submitted_at   timestamptz not null default now(),
  submitted_by   text
);

create index research_topics_status_idx on research_topics (status);

create table research_runs (
  id                 uuid primary key default gen_random_uuid(),
  topic_id           uuid not null references research_topics(id) on delete cascade,
  status             text not null default 'running',
  model_used         text,
  prompt_version     text,
  started_at         timestamptz not null default now(),
  completed_at       timestamptz,
  error_message      text,
  cost_estimate_usd  numeric(10,4),
  citations          jsonb
);

create table draft_signals (
  id                       uuid primary key default gen_random_uuid(),
  topic_id                 uuid not null references research_topics(id) on delete cascade,
  run_id                   uuid not null references research_runs(id) on delete cascade,
  proposed_title            text not null,
  proposed_category_id      uuid references categories(id),
  proposed_type              signal_type not null,
  proposed_body_copy         text not null,
  proposed_confidence         confidence_level not null default 'low',
  proposed_watching_text       text,
  proposed_claim_text          text,
  proposed_claim_resolves_around text,
  status                        draft_status not null default 'pending_review',
  reviewed_by                    text,
  reviewed_at                     timestamptz,
  rejection_reason                 text,
  published_signal_id               uuid references signals(id),
  created_at                         timestamptz not null default now()
);

create index draft_signals_status_idx on draft_signals (status);

create table draft_evidence (
  id                 uuid primary key default gen_random_uuid(),
  draft_signal_id    uuid not null references draft_signals(id) on delete cascade,
  tier               evidence_tier not null,
  direction          evidence_direction not null,
  cluster_no         int not null,
  source_name        text not null,
  source_url         text,
  description        text not null,
  ai_tier_rationale  text,
  sort_order          int not null default 0
);
