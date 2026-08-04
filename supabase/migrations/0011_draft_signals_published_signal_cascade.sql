-- draft_signals.published_signal_id had no ON DELETE behavior, unlike every
-- other FK pointing at signals(id) (evidence, signal_updates,
-- confidence_snapshots all cascade) — deleting a signal that any refresh
-- draft had ever referenced failed outright instead. SET NULL rather than
-- CASCADE: a draft_signals row is historical review data and shouldn't be
-- destroyed just because the signal it once proposed refreshing is gone.
alter table draft_signals
  drop constraint draft_signals_published_signal_id_fkey;

alter table draft_signals
  add constraint draft_signals_published_signal_id_fkey
  foreign key (published_signal_id) references signals(id) on delete set null;
