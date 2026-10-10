ALTER TABLE "admission_confirmations"
  ADD COLUMN "lms_sync_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lms_sync_error" TEXT,
  ADD COLUMN "lms_last_attempt_at" TIMESTAMP(3);
