CREATE TYPE "StaffLmsSyncStatus" AS ENUM ('pending', 'synced');

ALTER TABLE "staff_members"
  ADD COLUMN "lms_teacher_ref" TEXT,
  ADD COLUMN "lms_sync_status" "StaffLmsSyncStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "lms_sync_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lms_sync_error" TEXT,
  ADD COLUMN "lms_last_attempt_at" TIMESTAMP(3);
