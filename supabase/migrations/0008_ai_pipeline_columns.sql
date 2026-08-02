-- AI research pipeline: bring draft_signals/draft_evidence up to parity with
-- the real signals/evidence tables (they were missing fields added to the
-- real tables after the original research-pipeline schema was written), and
-- add a "premise" — the declarative, falsifiable statement Premise Strength
-- actually measures, which nothing on the site states explicitly today.
-- Automated evidence tiering can't work without one: the model has to judge
-- each item against a fixed sentence, not the reader-facing (often
-- question-form) title.

alter table draft_signals
  add column proposed_slug              text,
  add column proposed_meta_description  text,
  add column proposed_homepage_meta     text,
  add column proposed_premise           text,
  add column proposed_substack_article  text;

alter table draft_evidence
  add column source_published_at date;

alter table signals
  add column premise text;
