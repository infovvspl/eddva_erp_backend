-- Front Office tenant isolation (step 1 of 2), following the same pattern as
-- the Library, Sports and Inventory tenant-isolation migrations.
--
-- Adds a nullable institute_id to every Front Office data table, and replaces the
-- globally-unique keys (department name, employee email) with keys that are unique
-- per institute.
--
-- The column is nullable on purpose: existing rows have no institute yet. Until
-- prisma/backfill/front-office-institute-backfill.sql has been reviewed and run,
-- rows with a NULL institute_id are invisible to every school (the API always
-- filters by the caller's institute). A later migration should make the column
-- NOT NULL once the backfill is done.
--
-- Not applied automatically: review, then run `prisma migrate deploy` yourself.

-- DropIndex
DROP INDEX "front_office_departments_name_key";

-- DropIndex
DROP INDEX "front_office_employees_email_key";

-- AlterTable
ALTER TABLE "front_office_departments" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "front_office_employees" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "front_office_availability_slots" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "front_office_visitors" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "front_office_visitor_logs" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "front_office_enquiries" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "front_office_enquiry_followups" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "front_office_appointments" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "front_office_complaints" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "front_office_complaint_updates" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "front_office_attachments" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "front_office_notifications" ADD COLUMN     "institute_id" TEXT;

-- CreateIndex
CREATE INDEX "front_office_departments_institute_id_idx" ON "front_office_departments"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "front_office_departments_institute_id_name_key" ON "front_office_departments"("institute_id", "name");

-- CreateIndex
CREATE INDEX "front_office_employees_institute_id_idx" ON "front_office_employees"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "front_office_employees_institute_id_email_key" ON "front_office_employees"("institute_id", "email");

-- CreateIndex
CREATE INDEX "front_office_availability_slots_institute_id_idx" ON "front_office_availability_slots"("institute_id");

-- CreateIndex
CREATE INDEX "front_office_visitors_institute_id_idx" ON "front_office_visitors"("institute_id");

-- CreateIndex
CREATE INDEX "front_office_visitor_logs_institute_id_idx" ON "front_office_visitor_logs"("institute_id");

-- CreateIndex
CREATE INDEX "front_office_enquiries_institute_id_idx" ON "front_office_enquiries"("institute_id");

-- CreateIndex
CREATE INDEX "front_office_enquiry_followups_institute_id_idx" ON "front_office_enquiry_followups"("institute_id");

-- CreateIndex
CREATE INDEX "front_office_appointments_institute_id_idx" ON "front_office_appointments"("institute_id");

-- CreateIndex
CREATE INDEX "front_office_complaints_institute_id_idx" ON "front_office_complaints"("institute_id");

-- CreateIndex
CREATE INDEX "front_office_complaint_updates_institute_id_idx" ON "front_office_complaint_updates"("institute_id");

-- CreateIndex
CREATE INDEX "front_office_attachments_institute_id_idx" ON "front_office_attachments"("institute_id");

-- CreateIndex
CREATE INDEX "front_office_notifications_institute_id_idx" ON "front_office_notifications"("institute_id");

