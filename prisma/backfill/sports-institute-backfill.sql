-- Sports institute backfill. REVIEW BEFORE RUNNING; nothing runs this automatically.
--
-- Sports tables had no institute, so the ERP cannot know which school each existing row
-- belongs to. This script covers the common case: ALL existing Sports data belongs to ONE
-- institute. If existing rows belong to several schools, do NOT run it as-is; map them
-- yourself before assigning.
--
-- Usage:
--   psql "$DATABASE_URL" -v institute_id="'<institute uuid>'" -f prisma/backfill/sports-institute-backfill.sql
--
-- Runs in one transaction and prints before/after counts. Roll back by replacing COMMIT with ROLLBACK.

\echo 'Rows without an institute (before):'
SELECT 'sports_sports' AS tbl, count(*) FROM sports_sports WHERE institute_id IS NULL
UNION ALL SELECT 'sports_participants', count(*) FROM sports_participants WHERE institute_id IS NULL
UNION ALL SELECT 'sports_staff', count(*) FROM sports_staff WHERE institute_id IS NULL
UNION ALL SELECT 'sports_venues', count(*) FROM sports_venues WHERE institute_id IS NULL
UNION ALL SELECT 'sports_houses', count(*) FROM sports_houses WHERE institute_id IS NULL
UNION ALL SELECT 'sports_house_memberships', count(*) FROM sports_house_memberships WHERE institute_id IS NULL
UNION ALL SELECT 'sports_house_points', count(*) FROM sports_house_points WHERE institute_id IS NULL
UNION ALL SELECT 'sports_house_standings', count(*) FROM sports_house_standings WHERE institute_id IS NULL
UNION ALL SELECT 'sports_tournaments', count(*) FROM sports_tournaments WHERE institute_id IS NULL
UNION ALL SELECT 'sports_tournament_teams', count(*) FROM sports_tournament_teams WHERE institute_id IS NULL
UNION ALL SELECT 'sports_tournament_team_members', count(*) FROM sports_tournament_team_members WHERE institute_id IS NULL
UNION ALL SELECT 'sports_fixtures', count(*) FROM sports_fixtures WHERE institute_id IS NULL
UNION ALL SELECT 'sports_fixture_results', count(*) FROM sports_fixture_results WHERE institute_id IS NULL
UNION ALL SELECT 'sports_player_match_stats', count(*) FROM sports_player_match_stats WHERE institute_id IS NULL
UNION ALL SELECT 'sports_records', count(*) FROM sports_records WHERE institute_id IS NULL
UNION ALL SELECT 'sports_awards', count(*) FROM sports_awards WHERE institute_id IS NULL;

BEGIN;

-- Root tables: the single institute given on the command line.
UPDATE sports_sports       SET institute_id = :institute_id WHERE institute_id IS NULL;
UPDATE sports_participants SET institute_id = :institute_id WHERE institute_id IS NULL;
UPDATE sports_staff        SET institute_id = :institute_id WHERE institute_id IS NULL;
UPDATE sports_venues       SET institute_id = :institute_id WHERE institute_id IS NULL;
UPDATE sports_houses       SET institute_id = :institute_id WHERE institute_id IS NULL;
UPDATE sports_tournaments  SET institute_id = :institute_id WHERE institute_id IS NULL;

-- Dependent tables: inherit from their parent so the two can never disagree.
UPDATE sports_house_memberships m SET institute_id = h.institute_id FROM sports_houses h WHERE m.house_id = h.house_id AND m.institute_id IS NULL;
UPDATE sports_house_points p SET institute_id = h.institute_id FROM sports_houses h WHERE p.house_id = h.house_id AND p.institute_id IS NULL;
UPDATE sports_house_standings st SET institute_id = h.institute_id FROM sports_houses h WHERE st.house_id = h.house_id AND st.institute_id IS NULL;

UPDATE sports_tournament_teams tt SET institute_id = t.institute_id FROM sports_tournaments t WHERE tt.tournament_id = t.tournament_id AND tt.institute_id IS NULL;
UPDATE sports_tournament_team_members tm SET institute_id = tt.institute_id FROM sports_tournament_teams tt WHERE tm.tournament_team_id = tt.tournament_team_id AND tm.institute_id IS NULL;

UPDATE sports_fixtures f SET institute_id = t.institute_id FROM sports_tournaments t WHERE f.tournament_id = t.tournament_id AND f.institute_id IS NULL;
UPDATE sports_fixture_results r SET institute_id = f.institute_id FROM sports_fixtures f WHERE r.fixture_id = f.fixture_id AND r.institute_id IS NULL;
UPDATE sports_player_match_stats s SET institute_id = f.institute_id FROM sports_fixtures f WHERE s.fixture_id = f.fixture_id AND s.institute_id IS NULL;

UPDATE sports_records rec SET institute_id = sp.institute_id FROM sports_sports sp WHERE rec.sport_id = sp.sport_id AND rec.institute_id IS NULL;
UPDATE sports_awards a SET institute_id = t.institute_id FROM sports_tournaments t WHERE a.tournament_id = t.tournament_id AND a.institute_id IS NULL;

-- Safety check: a child that belongs to a different institute than its parent means the
-- data was mixed. Abort instead of committing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sports_fixtures f JOIN sports_tournaments t ON t.tournament_id = f.tournament_id
    WHERE f.institute_id IS DISTINCT FROM t.institute_id
  ) THEN
    RAISE EXCEPTION 'Fixtures and their tournaments belong to different institutes; aborting';
  END IF;
END $$;

COMMIT;

\echo 'Rows still without an institute (after; expect all zero):'
SELECT 'sports_sports' AS tbl, count(*) FROM sports_sports WHERE institute_id IS NULL
UNION ALL SELECT 'sports_participants', count(*) FROM sports_participants WHERE institute_id IS NULL
UNION ALL SELECT 'sports_staff', count(*) FROM sports_staff WHERE institute_id IS NULL
UNION ALL SELECT 'sports_venues', count(*) FROM sports_venues WHERE institute_id IS NULL
UNION ALL SELECT 'sports_houses', count(*) FROM sports_houses WHERE institute_id IS NULL
UNION ALL SELECT 'sports_house_memberships', count(*) FROM sports_house_memberships WHERE institute_id IS NULL
UNION ALL SELECT 'sports_house_points', count(*) FROM sports_house_points WHERE institute_id IS NULL
UNION ALL SELECT 'sports_house_standings', count(*) FROM sports_house_standings WHERE institute_id IS NULL
UNION ALL SELECT 'sports_tournaments', count(*) FROM sports_tournaments WHERE institute_id IS NULL
UNION ALL SELECT 'sports_tournament_teams', count(*) FROM sports_tournament_teams WHERE institute_id IS NULL
UNION ALL SELECT 'sports_tournament_team_members', count(*) FROM sports_tournament_team_members WHERE institute_id IS NULL
UNION ALL SELECT 'sports_fixtures', count(*) FROM sports_fixtures WHERE institute_id IS NULL
UNION ALL SELECT 'sports_fixture_results', count(*) FROM sports_fixture_results WHERE institute_id IS NULL
UNION ALL SELECT 'sports_player_match_stats', count(*) FROM sports_player_match_stats WHERE institute_id IS NULL
UNION ALL SELECT 'sports_records', count(*) FROM sports_records WHERE institute_id IS NULL
UNION ALL SELECT 'sports_awards', count(*) FROM sports_awards WHERE institute_id IS NULL;
