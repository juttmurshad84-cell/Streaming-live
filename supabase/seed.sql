-- Reference data only (sports categories). No fake users, streams, scores or videos are seeded here.
insert into public.sports_categories (slug, name, sort_order, provider_sport_name) values
  ('cricket',    'Cricket',      10, 'Cricket'),
  ('football',   'Football',     20, 'Soccer'),
  ('basketball', 'Basketball',   30, 'Basketball'),
  ('tennis',     'Tennis',       40, 'Tennis'),
  ('volleyball', 'Volleyball',   50, 'Volleyball'),
  ('hockey',     'Hockey',       60, 'Ice Hockey'),
  ('rugby',      'Rugby',        70, 'Rugby'),
  ('baseball',   'Baseball',     80, 'Baseball'),
  ('badminton',  'Badminton',    90, 'Badminton'),
  ('esports',    'Esports',     100, null),
  ('other',      'Other sports',110, null)
on conflict (slug) do nothing;
