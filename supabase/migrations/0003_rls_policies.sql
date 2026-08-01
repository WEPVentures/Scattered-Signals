-- Single-user dashboard: the authenticated user gets full read/write on
-- every table. The public site never talks to Supabase directly (it's
-- generated at build time using the service role key, which bypasses RLS
-- entirely) so there is deliberately no anon/public policy here — draft
-- and unpublished content stays invisible to anyone without a login.

alter table categories enable row level security;
alter table signals enable row level security;
alter table signal_updates enable row level security;
alter table evidence enable row level security;
alter table confidence_snapshots enable row level security;
alter table research_topics enable row level security;
alter table research_runs enable row level security;
alter table draft_signals enable row level security;
alter table draft_evidence enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'signals', 'signal_updates', 'evidence', 'confidence_snapshots',
    'research_topics', 'research_runs', 'draft_signals', 'draft_evidence'
  ]
  loop
    execute format(
      'create policy "authenticated full access" on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
