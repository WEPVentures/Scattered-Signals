-- Plot Movement: Living Topics get a two-pole narrative spectrum instead of
-- the Low/Moderate/High/Collapsed Evidence Strength scale used by Bounded
-- Claims. Pole labels are editorially assigned (by human researchers/writers
-- and by the AI draft pipeline) the same way premise already is — never
-- reader-supplied. current_read is the "Plot Status" card's body: a short,
-- refreshed-on-each-pass summary of where the narrative stands right now.
-- All nullable — only meaningful when signals.type = 'trend', mirroring how
-- the existing claim-only columns are nullable and unused for trends.

alter table signals
  add column pole_a_label text,
  add column pole_b_label text,
  add column current_read text;

alter table draft_signals
  add column proposed_pole_a_label text,
  add column proposed_pole_b_label text,
  add column proposed_current_read text;
