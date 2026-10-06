-- Sports tenant isolation (step 1 of 2), following the same pattern as
-- 20260925090000_library_tenant_isolation.
--
-- Adds a nullable institute_id to every Sports data table, and replaces the
-- globally-unique keys (sport name, venue name, house name) with keys that
-- are unique per institute.
--
-- The column is nullable on purpose: existing rows have no institute yet. Until
-- prisma/backfill/sports-institute-backfill.sql has been reviewed and run, rows with a
-- NULL institute_id are invisible to every school (the API always filters by the caller's
-- institute). A later migration should make the column NOT NULL once the backfill is done.
--
-- Not applied automatically: review, then run `prisma migrate deploy` yourself.

-- DropIndex
DROP INDEX "sports_sports_name_key";

-- DropIndex
DROP INDEX "sports_venues_name_key";

-- DropIndex
DROP INDEX "sports_houses_name_key";

-- AlterTable
ALTER TABLE "sports_sports" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "sports_participants" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "sports_staff" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "sports_venues" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "sports_houses" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "sports_house_memberships" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "sports_house_points" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "sports_house_standings" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "sports_tournaments" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "sports_tournament_teams" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "sports_tournament_team_members" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "sports_fixtures" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "sports_fixture_results" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "sports_player_match_stats" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "sports_records" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "sports_awards" ADD COLUMN     "institute_id" TEXT;

-- CreateIndex
CREATE INDEX "sports_sports_institute_id_idx" ON "sports_sports"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "sports_sports_institute_id_name_key" ON "sports_sports"("institute_id", "name");

-- CreateIndex
CREATE INDEX "sports_participants_institute_id_idx" ON "sports_participants"("institute_id");

-- CreateIndex
CREATE INDEX "sports_staff_institute_id_idx" ON "sports_staff"("institute_id");

-- CreateIndex
CREATE INDEX "sports_venues_institute_id_idx" ON "sports_venues"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "sports_venues_institute_id_name_key" ON "sports_venues"("institute_id", "name");

-- CreateIndex
CREATE INDEX "sports_houses_institute_id_idx" ON "sports_houses"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "sports_houses_institute_id_name_key" ON "sports_houses"("institute_id", "name");

-- CreateIndex
CREATE INDEX "sports_house_memberships_institute_id_idx" ON "sports_house_memberships"("institute_id");

-- CreateIndex
CREATE INDEX "sports_house_points_institute_id_idx" ON "sports_house_points"("institute_id");

-- CreateIndex
CREATE INDEX "sports_house_standings_institute_id_idx" ON "sports_house_standings"("institute_id");

-- CreateIndex
CREATE INDEX "sports_tournaments_institute_id_idx" ON "sports_tournaments"("institute_id");

-- CreateIndex
CREATE INDEX "sports_tournament_teams_institute_id_idx" ON "sports_tournament_teams"("institute_id");

-- CreateIndex
CREATE INDEX "sports_tournament_team_members_institute_id_idx" ON "sports_tournament_team_members"("institute_id");

-- CreateIndex
CREATE INDEX "sports_fixtures_institute_id_idx" ON "sports_fixtures"("institute_id");

-- CreateIndex
CREATE INDEX "sports_fixture_results_institute_id_idx" ON "sports_fixture_results"("institute_id");

-- CreateIndex
CREATE INDEX "sports_player_match_stats_institute_id_idx" ON "sports_player_match_stats"("institute_id");

-- CreateIndex
CREATE INDEX "sports_records_institute_id_idx" ON "sports_records"("institute_id");

-- CreateIndex
CREATE INDEX "sports_awards_institute_id_idx" ON "sports_awards"("institute_id");

