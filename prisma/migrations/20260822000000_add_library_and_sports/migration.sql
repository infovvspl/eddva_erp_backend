-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LibMemberType" AS ENUM ('student', 'staff', 'faculty');

-- CreateEnum
CREATE TYPE "LibMemberStatus" AS ENUM ('active', 'suspended', 'expired');

-- CreateEnum
CREATE TYPE "LibUserRole" AS ENUM ('admin', 'librarian');

-- CreateEnum
CREATE TYPE "LibCopyCondition" AS ENUM ('new', 'good', 'worn', 'damaged');

-- CreateEnum
CREATE TYPE "LibCopyStatus" AS ENUM ('available', 'issued', 'reserved', 'lost', 'under_repair', 'withdrawn');

-- CreateEnum
CREATE TYPE "LibIssueStatus" AS ENUM ('issued', 'returned', 'overdue', 'lost');

-- CreateEnum
CREATE TYPE "LibReservationStatus" AS ENUM ('pending', 'ready_for_pickup', 'fulfilled', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "LibFineReason" AS ENUM ('overdue', 'lost_book', 'damaged_book');

-- CreateEnum
CREATE TYPE "LibFineStatus" AS ENUM ('pending', 'paid', 'waived', 'partially_paid');

-- CreateEnum
CREATE TYPE "LibPaymentMode" AS ENUM ('cash', 'card', 'upi', 'waived');

-- CreateEnum
CREATE TYPE "SportsCategory" AS ENUM ('team', 'individual');

-- CreateEnum
CREATE TYPE "SportsStaffRole" AS ENUM ('coach', 'house_master', 'official');

-- CreateEnum
CREATE TYPE "SportsVenueType" AS ENUM ('ground', 'court', 'pool', 'hall');

-- CreateEnum
CREATE TYPE "SportsUserRole" AS ENUM ('admin', 'coach', 'house_master');

-- CreateEnum
CREATE TYPE "SportsMembershipStatus" AS ENUM ('active', 'transferred');

-- CreateEnum
CREATE TYPE "SportsPointSourceType" AS ENUM ('tournament_result', 'discipline', 'participation', 'other');

-- CreateEnum
CREATE TYPE "SportsTournamentLevel" AS ENUM ('inter_house', 'inter_school', 'inter_district');

-- CreateEnum
CREATE TYPE "SportsTournamentFormat" AS ENUM ('knockout', 'league', 'round_robin');

-- CreateEnum
CREATE TYPE "SportsTournamentStatus" AS ENUM ('upcoming', 'ongoing', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "SportsFixtureStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'postponed', 'walkover');

-- CreateEnum
CREATE TYPE "SportsRecordType" AS ENUM ('personal_best', 'tournament_win', 'milestone', 'school_record');

-- CreateTable
CREATE TABLE "library_categories" (
    "category_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "library_categories_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "library_members" (
    "member_id" SERIAL NOT NULL,
    "external_ref_id" TEXT,
    "name" TEXT NOT NULL,
    "member_type" "LibMemberType" NOT NULL,
    "library_card_number" TEXT NOT NULL,
    "status" "LibMemberStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_members_pkey" PRIMARY KEY ("member_id")
);

-- CreateTable
CREATE TABLE "library_users" (
    "user_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "role" "LibUserRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "library_membership_rules" (
    "rule_id" SERIAL NOT NULL,
    "member_type" "LibMemberType" NOT NULL,
    "max_books_allowed" INTEGER NOT NULL,
    "loan_period_days" INTEGER NOT NULL,
    "fine_per_day" DECIMAL(10,2) NOT NULL,
    "grace_period_days" INTEGER NOT NULL DEFAULT 0,
    "max_fine_cap" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_membership_rules_pkey" PRIMARY KEY ("rule_id")
);

-- CreateTable
CREATE TABLE "library_books" (
    "book_id" SERIAL NOT NULL,
    "isbn" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "publisher" TEXT,
    "edition" TEXT,
    "category_id" INTEGER NOT NULL,
    "language" TEXT DEFAULT 'English',
    "publish_year" INTEGER,
    "description" TEXT,
    "cover_image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_books_pkey" PRIMARY KEY ("book_id")
);

-- CreateTable
CREATE TABLE "library_book_vendors" (
    "book_vendor_id" SERIAL NOT NULL,
    "book_id" INTEGER NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "last_purchase_price" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_book_vendors_pkey" PRIMARY KEY ("book_vendor_id")
);

-- CreateTable
CREATE TABLE "library_book_copies" (
    "copy_id" SERIAL NOT NULL,
    "book_id" INTEGER NOT NULL,
    "barcode" TEXT NOT NULL,
    "accession_number" TEXT NOT NULL,
    "rack_location" TEXT,
    "condition" "LibCopyCondition" NOT NULL DEFAULT 'new',
    "status" "LibCopyStatus" NOT NULL DEFAULT 'available',
    "acquired_date" DATE,
    "price" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_book_copies_pkey" PRIMARY KEY ("copy_id")
);

-- CreateTable
CREATE TABLE "library_issue_records" (
    "issue_id" SERIAL NOT NULL,
    "copy_id" INTEGER NOT NULL,
    "member_id" INTEGER NOT NULL,
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "return_date" DATE,
    "renewal_count" INTEGER NOT NULL DEFAULT 0,
    "status" "LibIssueStatus" NOT NULL DEFAULT 'issued',
    "issued_by" INTEGER NOT NULL,
    "returned_to" INTEGER,
    "fine_per_day" DECIMAL(10,2) NOT NULL,
    "grace_period_days" INTEGER NOT NULL DEFAULT 0,
    "max_fine_cap" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_issue_records_pkey" PRIMARY KEY ("issue_id")
);

-- CreateTable
CREATE TABLE "library_reservations" (
    "reservation_id" SERIAL NOT NULL,
    "book_id" INTEGER NOT NULL,
    "member_id" INTEGER NOT NULL,
    "reserved_date" DATE NOT NULL,
    "status" "LibReservationStatus" NOT NULL DEFAULT 'pending',
    "expiry_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_reservations_pkey" PRIMARY KEY ("reservation_id")
);

-- CreateTable
CREATE TABLE "library_fines" (
    "fine_id" SERIAL NOT NULL,
    "issue_id" INTEGER NOT NULL,
    "member_id" INTEGER NOT NULL,
    "reason" "LibFineReason" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "LibFineStatus" NOT NULL DEFAULT 'pending',
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_fines_pkey" PRIMARY KEY ("fine_id")
);

-- CreateTable
CREATE TABLE "library_fine_payments" (
    "payment_id" SERIAL NOT NULL,
    "fine_id" INTEGER NOT NULL,
    "amount_paid" DECIMAL(10,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_mode" "LibPaymentMode" NOT NULL,
    "received_by" INTEGER NOT NULL,
    "transaction_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_fine_payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "library_notification_logs" (
    "log_id" SERIAL NOT NULL,
    "member_id" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "ref_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_notification_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "library_dynamic_roles" (
    "role_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_dynamic_roles_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "library_user_dynamic_roles" (
    "id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "eddva_user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "role_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_user_dynamic_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_sso_sessions" (
    "session_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "eddva_user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT,
    "user_role" TEXT NOT NULL,
    "lib_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_sso_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "sports_sports" (
    "sport_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SportsCategory" NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_sports_pkey" PRIMARY KEY ("sport_id")
);

-- CreateTable
CREATE TABLE "sports_participants" (
    "participant_id" SERIAL NOT NULL,
    "external_ref_id" TEXT,
    "name" TEXT NOT NULL,
    "class_section" TEXT,
    "roll_number" TEXT,
    "gender" TEXT,
    "photo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_participants_pkey" PRIMARY KEY ("participant_id")
);

-- CreateTable
CREATE TABLE "sports_staff" (
    "staff_id" SERIAL NOT NULL,
    "external_ref_id" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_staff_pkey" PRIMARY KEY ("staff_id")
);

-- CreateTable
CREATE TABLE "sports_venues" (
    "venue_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SportsVenueType" NOT NULL,
    "capacity" INTEGER,
    "location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_venues_pkey" PRIMARY KEY ("venue_id")
);

-- CreateTable
CREATE TABLE "sports_users" (
    "user_id" SERIAL NOT NULL,
    "staff_id" INTEGER,
    "role" "SportsUserRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "sports_houses" (
    "house_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "color_code" TEXT,
    "house_master_id" INTEGER,
    "motto" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_houses_pkey" PRIMARY KEY ("house_id")
);

-- CreateTable
CREATE TABLE "sports_house_memberships" (
    "membership_id" SERIAL NOT NULL,
    "participant_id" INTEGER NOT NULL,
    "house_id" INTEGER NOT NULL,
    "academic_year" TEXT NOT NULL,
    "status" "SportsMembershipStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_house_memberships_pkey" PRIMARY KEY ("membership_id")
);

-- CreateTable
CREATE TABLE "sports_house_points" (
    "point_id" SERIAL NOT NULL,
    "house_id" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "source_type" "SportsPointSourceType" NOT NULL,
    "source_reference_id" INTEGER,
    "reason" TEXT,
    "awarded_date" DATE NOT NULL,
    "awarded_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_house_points_pkey" PRIMARY KEY ("point_id")
);

-- CreateTable
CREATE TABLE "sports_house_standings" (
    "house_id" INTEGER NOT NULL,
    "academic_year" TEXT NOT NULL,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_house_standings_pkey" PRIMARY KEY ("house_id","academic_year")
);

-- CreateTable
CREATE TABLE "sports_tournaments" (
    "tournament_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sport_id" INTEGER NOT NULL,
    "level" "SportsTournamentLevel" NOT NULL DEFAULT 'inter_house',
    "format" "SportsTournamentFormat" NOT NULL DEFAULT 'knockout',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "venue_id" INTEGER,
    "status" "SportsTournamentStatus" NOT NULL DEFAULT 'upcoming',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_tournaments_pkey" PRIMARY KEY ("tournament_id")
);

-- CreateTable
CREATE TABLE "sports_tournament_teams" (
    "tournament_team_id" SERIAL NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "house_id" INTEGER,
    "team_name" TEXT NOT NULL,
    "coach_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_tournament_teams_pkey" PRIMARY KEY ("tournament_team_id")
);

-- CreateTable
CREATE TABLE "sports_tournament_team_members" (
    "member_id" SERIAL NOT NULL,
    "tournament_team_id" INTEGER NOT NULL,
    "participant_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'player',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_tournament_team_members_pkey" PRIMARY KEY ("member_id")
);

-- CreateTable
CREATE TABLE "sports_fixtures" (
    "fixture_id" SERIAL NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "round" TEXT NOT NULL,
    "team_a_id" INTEGER NOT NULL,
    "team_b_id" INTEGER NOT NULL,
    "venue_id" INTEGER,
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "status" "SportsFixtureStatus" NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_fixtures_pkey" PRIMARY KEY ("fixture_id")
);

-- CreateTable
CREATE TABLE "sports_fixture_results" (
    "result_id" SERIAL NOT NULL,
    "fixture_id" INTEGER NOT NULL,
    "team_a_score" TEXT NOT NULL,
    "team_b_score" TEXT NOT NULL,
    "winner_team_id" INTEGER,
    "result_notes" TEXT,
    "recorded_by" INTEGER,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_fixture_results_pkey" PRIMARY KEY ("result_id")
);

-- CreateTable
CREATE TABLE "sports_player_match_stats" (
    "stat_id" SERIAL NOT NULL,
    "fixture_id" INTEGER NOT NULL,
    "participant_id" INTEGER NOT NULL,
    "stat_type" TEXT NOT NULL,
    "stat_value" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "sports_player_match_stats_pkey" PRIMARY KEY ("stat_id")
);

-- CreateTable
CREATE TABLE "sports_records" (
    "record_id" SERIAL NOT NULL,
    "participant_id" INTEGER,
    "tournament_team_id" INTEGER,
    "sport_id" INTEGER NOT NULL,
    "record_type" "SportsRecordType" NOT NULL,
    "description" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "achieved_date" DATE NOT NULL,
    "source_fixture_id" INTEGER,
    "verified_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_records_pkey" PRIMARY KEY ("record_id")
);

-- CreateTable
CREATE TABLE "sports_awards" (
    "award_id" SERIAL NOT NULL,
    "participant_id" INTEGER,
    "tournament_team_id" INTEGER,
    "tournament_id" INTEGER NOT NULL,
    "award_type" TEXT NOT NULL,
    "issued_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_awards_pkey" PRIMARY KEY ("award_id")
);

-- CreateTable
CREATE TABLE "sports_dynamic_roles" (
    "role_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_dynamic_roles_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "sports_user_dynamic_roles" (
    "id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "eddva_user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "role_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_user_dynamic_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_sso_sessions" (
    "session_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "eddva_user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT,
    "user_role" TEXT NOT NULL,
    "sports_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_sso_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "library_permissions" (
    "permission_id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_permissions_pkey" PRIMARY KEY ("permission_id")
);

-- CreateTable
CREATE TABLE "sports_permissions" (
    "permission_id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_permissions_pkey" PRIMARY KEY ("permission_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "library_categories_name_key" ON "library_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "library_members_library_card_number_key" ON "library_members"("library_card_number");

-- CreateIndex
CREATE UNIQUE INDEX "library_membership_rules_member_type_key" ON "library_membership_rules"("member_type");

-- CreateIndex
CREATE UNIQUE INDEX "library_books_isbn_key" ON "library_books"("isbn");

-- CreateIndex
CREATE UNIQUE INDEX "library_book_copies_barcode_key" ON "library_book_copies"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "library_book_copies_accession_number_key" ON "library_book_copies"("accession_number");

-- CreateIndex
CREATE UNIQUE INDEX "library_dynamic_roles_institute_id_name_key" ON "library_dynamic_roles"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "library_user_dynamic_roles_institute_id_eddva_user_id_key" ON "library_user_dynamic_roles"("institute_id", "eddva_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_user_dynamic_roles_institute_id_username_key" ON "library_user_dynamic_roles"("institute_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "library_sso_sessions_lib_token_key" ON "library_sso_sessions"("lib_token");

-- CreateIndex
CREATE UNIQUE INDEX "sports_sports_name_key" ON "sports_sports"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sports_venues_name_key" ON "sports_venues"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sports_houses_name_key" ON "sports_houses"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sports_house_memberships_participant_id_academic_year_key" ON "sports_house_memberships"("participant_id", "academic_year");

-- CreateIndex
CREATE UNIQUE INDEX "sports_tournament_team_members_tournament_team_id_participa_key" ON "sports_tournament_team_members"("tournament_team_id", "participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "sports_fixture_results_fixture_id_key" ON "sports_fixture_results"("fixture_id");

-- CreateIndex
CREATE UNIQUE INDEX "sports_dynamic_roles_institute_id_name_key" ON "sports_dynamic_roles"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sports_user_dynamic_roles_institute_id_eddva_user_id_key" ON "sports_user_dynamic_roles"("institute_id", "eddva_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sports_user_dynamic_roles_institute_id_username_key" ON "sports_user_dynamic_roles"("institute_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "sports_sso_sessions_sports_token_key" ON "sports_sso_sessions"("sports_token");

-- CreateIndex
CREATE UNIQUE INDEX "library_permissions_key_key" ON "library_permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "sports_permissions_key_key" ON "sports_permissions"("key");

-- AddForeignKey
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "library_categories"("category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_book_vendors" ADD CONSTRAINT "library_book_vendors_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "library_books"("book_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_book_copies" ADD CONSTRAINT "library_book_copies_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "library_books"("book_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_issue_records" ADD CONSTRAINT "library_issue_records_copy_id_fkey" FOREIGN KEY ("copy_id") REFERENCES "library_book_copies"("copy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_issue_records" ADD CONSTRAINT "library_issue_records_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "library_members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_issue_records" ADD CONSTRAINT "library_issue_records_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "library_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_issue_records" ADD CONSTRAINT "library_issue_records_returned_to_fkey" FOREIGN KEY ("returned_to") REFERENCES "library_users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "library_books"("book_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "library_members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fines" ADD CONSTRAINT "library_fines_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "library_issue_records"("issue_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fines" ADD CONSTRAINT "library_fines_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "library_members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fine_payments" ADD CONSTRAINT "library_fine_payments_fine_id_fkey" FOREIGN KEY ("fine_id") REFERENCES "library_fines"("fine_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fine_payments" ADD CONSTRAINT "library_fine_payments_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "library_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_notification_logs" ADD CONSTRAINT "library_notification_logs_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "library_members"("member_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_user_dynamic_roles" ADD CONSTRAINT "library_user_dynamic_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "library_dynamic_roles"("role_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_users" ADD CONSTRAINT "sports_users_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "sports_staff"("staff_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_houses" ADD CONSTRAINT "sports_houses_house_master_id_fkey" FOREIGN KEY ("house_master_id") REFERENCES "sports_staff"("staff_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_house_memberships" ADD CONSTRAINT "sports_house_memberships_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "sports_participants"("participant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_house_memberships" ADD CONSTRAINT "sports_house_memberships_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "sports_houses"("house_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_house_points" ADD CONSTRAINT "sports_house_points_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "sports_houses"("house_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_house_points" ADD CONSTRAINT "sports_house_points_awarded_by_fkey" FOREIGN KEY ("awarded_by") REFERENCES "sports_users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_house_standings" ADD CONSTRAINT "sports_house_standings_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "sports_houses"("house_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_tournaments" ADD CONSTRAINT "sports_tournaments_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports_sports"("sport_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_tournaments" ADD CONSTRAINT "sports_tournaments_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "sports_venues"("venue_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_tournaments" ADD CONSTRAINT "sports_tournaments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "sports_users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_tournament_teams" ADD CONSTRAINT "sports_tournament_teams_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "sports_tournaments"("tournament_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_tournament_teams" ADD CONSTRAINT "sports_tournament_teams_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "sports_houses"("house_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_tournament_teams" ADD CONSTRAINT "sports_tournament_teams_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "sports_staff"("staff_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_tournament_team_members" ADD CONSTRAINT "sports_tournament_team_members_tournament_team_id_fkey" FOREIGN KEY ("tournament_team_id") REFERENCES "sports_tournament_teams"("tournament_team_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_tournament_team_members" ADD CONSTRAINT "sports_tournament_team_members_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "sports_participants"("participant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_fixtures" ADD CONSTRAINT "sports_fixtures_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "sports_tournaments"("tournament_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_fixtures" ADD CONSTRAINT "sports_fixtures_team_a_id_fkey" FOREIGN KEY ("team_a_id") REFERENCES "sports_tournament_teams"("tournament_team_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_fixtures" ADD CONSTRAINT "sports_fixtures_team_b_id_fkey" FOREIGN KEY ("team_b_id") REFERENCES "sports_tournament_teams"("tournament_team_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_fixtures" ADD CONSTRAINT "sports_fixtures_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "sports_venues"("venue_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_fixture_results" ADD CONSTRAINT "sports_fixture_results_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "sports_fixtures"("fixture_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_fixture_results" ADD CONSTRAINT "sports_fixture_results_winner_team_id_fkey" FOREIGN KEY ("winner_team_id") REFERENCES "sports_tournament_teams"("tournament_team_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_fixture_results" ADD CONSTRAINT "sports_fixture_results_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "sports_users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_player_match_stats" ADD CONSTRAINT "sports_player_match_stats_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "sports_fixtures"("fixture_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_player_match_stats" ADD CONSTRAINT "sports_player_match_stats_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "sports_participants"("participant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_records" ADD CONSTRAINT "sports_records_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "sports_participants"("participant_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_records" ADD CONSTRAINT "sports_records_tournament_team_id_fkey" FOREIGN KEY ("tournament_team_id") REFERENCES "sports_tournament_teams"("tournament_team_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_records" ADD CONSTRAINT "sports_records_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports_sports"("sport_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_records" ADD CONSTRAINT "sports_records_source_fixture_id_fkey" FOREIGN KEY ("source_fixture_id") REFERENCES "sports_fixtures"("fixture_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_records" ADD CONSTRAINT "sports_records_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "sports_users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_awards" ADD CONSTRAINT "sports_awards_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "sports_participants"("participant_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_awards" ADD CONSTRAINT "sports_awards_tournament_team_id_fkey" FOREIGN KEY ("tournament_team_id") REFERENCES "sports_tournament_teams"("tournament_team_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_awards" ADD CONSTRAINT "sports_awards_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "sports_tournaments"("tournament_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_user_dynamic_roles" ADD CONSTRAINT "sports_user_dynamic_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "sports_dynamic_roles"("role_id") ON DELETE CASCADE ON UPDATE CASCADE;
