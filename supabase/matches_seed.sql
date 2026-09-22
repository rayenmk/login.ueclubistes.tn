-- Seed: real upcoming Club Africain home fixtures (Stade Olympique de Radès).
-- Source: public football calendars (besoccer.com / footmercato.net) as of 2026-09-22.
-- Only HOME matches are seeded: the subscriber "choose your place" flow
-- (Pelouse / Enceinte inf. / Enceinte sup. / Virage 1 / Virage 2) only makes
-- sense for matches played at Club Africain's own stadium.
--
-- IMPORTANT: Tunisian Ligue 1 / CAF fixture dates and kickoff times are
-- frequently adjusted by the federation/TV broadcaster after publication.
-- Re-check these dates on ftf.org.tn / cafonline.com before relying on them,
-- and adjust from the Matchs admin page if a date changes.
--
-- Safe to re-run: skips rows that already exist for the same opponent+date.

insert into public.matches (sport, home_team, away_team, competition, stadium, match_date, match_time, description, is_active)
select v.sport, v.home_team, v.away_team, v.competition, v.stadium, v.match_date::date, v.match_time::time, v.description, true
from (
  values
    ('FOOTBALL', 'Club Africain', 'CA Bizertin',        'Ligue 1 — Journée 6',                 'Stade Olympique de Radès', '2026-10-17', '16:30', null),
    ('FOOTBALL', 'Club Africain', 'Espérance de Tunis',  'Ligue 1 — Journée 8 (Derby)',          'Stade Olympique de Radès', '2026-10-20', null,    'Derby tunisois'),
    ('FOOTBALL', 'Club Africain', 'TP Mazembe',          'Ligue des Champions CAF',              'Stade Olympique de Radès', '2026-10-22', null,    null),
    ('FOOTBALL', 'Club Africain', 'JS Omrane',           'Ligue 1 — Journée 10',                 'Stade Olympique de Radès', '2026-11-03', null,    null),
    ('FOOTBALL', 'Club Africain', 'CS Hammam-Lif',       'Ligue 1 — Journée 12',                 'Stade Olympique de Radès', '2026-11-17', null,    null),
    ('FOOTBALL', 'Club Africain', 'CS Sfaxien',          'Ligue 1 — Journée 14',                 'Stade Olympique de Radès', '2026-11-29', null,    null),
    ('FOOTBALL', 'Club Africain', 'Espérance de Tunis',  'Supercoupe de Tunisie — Finale',       'Stade Olympique de Radès', '2027-01-29', null,    null)
) as v(sport, home_team, away_team, competition, stadium, match_date, match_time, description)
where not exists (
  select 1 from public.matches m
  where m.away_team = v.away_team
    and m.match_date = v.match_date::date
);
