-- The homepage list's meta line ("Moderate confidence · Rising · 3
-- clusters · Claim pending Q1 2027" / "Resolved Jul 31 · A case study in
-- why this matters") is bespoke editorial copy per signal, not something
-- a formula can reliably reproduce across trends, pending claims, and
-- resolved claims. Editor-controlled free text instead.

alter table signals add column homepage_meta text not null default '';
