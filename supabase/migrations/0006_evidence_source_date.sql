-- When the underlying source was actually published — not to be confused
-- with evidence.created_at, which is when the item was added to the
-- dashboard. This is what a real timeline/chart should plot against.
-- Nullable: editors won't always know an exact date.

alter table evidence add column source_published_at date;
