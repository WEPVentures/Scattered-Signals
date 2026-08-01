-- Expand the category taxonomy ahead of content. Seeded now so the
-- dashboard's category picker is ready whenever a signal in a new beat
-- gets drafted — the homepage only shows a filter pill for a category once
-- it has at least one published signal (see renderIndexPage), so adding
-- these rows has no visible effect on the site until then.
--
-- Style and Fashion were requested separately but are close enough to the
-- same beat editorially that splitting them would just fragment a small
-- number of signals across two thin categories — merged into one.
insert into categories (slug, label, sort_order) values
  ('technology', 'Technology', 4),
  ('business-economy', 'Business & Economy', 5),
  ('health', 'Health', 6),
  ('science', 'Science', 7),
  ('environment-climate', 'Environment & Climate', 8),
  ('food-beverage', 'Food & Beverage', 9),
  ('travel', 'Travel', 10),
  ('transportation', 'Transportation', 11),
  ('sports', 'Sports', 12),
  ('arts', 'Arts', 13),
  ('entertainment', 'Entertainment', 14),
  ('style-fashion', 'Style & Fashion', 15),
  ('media', 'Media', 16),
  ('law-justice', 'Law & Justice', 17),
  ('education', 'Education', 18),
  ('real-estate', 'Real Estate', 19),
  ('opinion', 'Opinion', 20);
