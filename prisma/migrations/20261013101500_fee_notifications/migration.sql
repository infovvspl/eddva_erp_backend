CREATE TYPE "FeeNotificationStatus" AS ENUM ('queued', 'sent', 'failed');

CREATE TABLE "fee_notifications" (
  "notification_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" INTEGER NOT NULL,
  "event_type" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'email',
  "recipient" TEXT,
  "message" TEXT,
  "status" "FeeNotificationStatus" NOT NULL DEFAULT 'queued',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "fee_notifications_institute_id_event_type_idx" ON "fee_notifications"("institute_id", "event_type");
