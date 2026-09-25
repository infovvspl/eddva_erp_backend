-- Library tenant isolation (step 1 of 2).
--
-- Adds a nullable institute_id to the Library tables that own data, and replaces the
-- globally-unique keys (category name, card number, membership type, ISBN, barcode,
-- accession number) with keys that are unique per institute.
--
-- The column is nullable on purpose: existing rows have no institute yet. Until
-- prisma/backfill/library-institute-backfill.sql has been reviewed and run, rows with a
-- NULL institute_id are invisible to every school (the API always filters by the caller's
-- institute). A later migration should make the column NOT NULL once the backfill is done.
--
-- Not applied automatically: review, then run `prisma migrate deploy` yourself.

-- DropIndex
DROP INDEX "library_categories_name_key";

-- DropIndex
DROP INDEX "library_members_library_card_number_key";

-- DropIndex
DROP INDEX "library_membership_rules_member_type_key";

-- DropIndex
DROP INDEX "library_books_isbn_key";

-- DropIndex
DROP INDEX "library_book_copies_barcode_key";

-- DropIndex
DROP INDEX "library_book_copies_accession_number_key";

-- AlterTable
ALTER TABLE "library_categories" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "library_members" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "library_membership_rules" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "library_books" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "library_book_copies" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "library_issue_records" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "library_reservations" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "library_fines" ADD COLUMN     "institute_id" TEXT;

-- CreateIndex
CREATE INDEX "library_categories_institute_id_idx" ON "library_categories"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_categories_institute_id_name_key" ON "library_categories"("institute_id", "name");

-- CreateIndex
CREATE INDEX "library_members_institute_id_idx" ON "library_members"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_members_institute_id_library_card_number_key" ON "library_members"("institute_id", "library_card_number");

-- CreateIndex
CREATE INDEX "library_membership_rules_institute_id_idx" ON "library_membership_rules"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_membership_rules_institute_id_member_type_key" ON "library_membership_rules"("institute_id", "member_type");

-- CreateIndex
CREATE INDEX "library_books_institute_id_idx" ON "library_books"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_books_institute_id_isbn_key" ON "library_books"("institute_id", "isbn");

-- CreateIndex
CREATE INDEX "library_book_copies_institute_id_idx" ON "library_book_copies"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_book_copies_institute_id_barcode_key" ON "library_book_copies"("institute_id", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "library_book_copies_institute_id_accession_number_key" ON "library_book_copies"("institute_id", "accession_number");

-- CreateIndex
CREATE INDEX "library_issue_records_institute_id_status_idx" ON "library_issue_records"("institute_id", "status");

-- CreateIndex
CREATE INDEX "library_reservations_institute_id_status_idx" ON "library_reservations"("institute_id", "status");

-- CreateIndex
CREATE INDEX "library_fines_institute_id_status_idx" ON "library_fines"("institute_id", "status");

