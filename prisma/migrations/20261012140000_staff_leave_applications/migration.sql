CREATE TYPE "LeaveApplicationStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE "StaffNotificationStatus" AS ENUM ('queued', 'sent', 'failed');

CREATE TABLE "staff_leave_applications" (
  "application_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "staff_id" INTEGER NOT NULL,
  "leave_type_id" INTEGER NOT NULL,
  "from_date" DATE NOT NULL,
  "to_date" DATE NOT NULL,
  "days_count" DECIMAL(5,1) NOT NULL,
  "reason" TEXT,
  "status" "LeaveApplicationStatus" NOT NULL DEFAULT 'pending',
  "applied_by" TEXT NOT NULL,
  "decided_by" TEXT,
  "decided_at" TIMESTAMP(3),
  "decision_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_leave_applications_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("staff_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "staff_leave_applications_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "staff_leave_types"("leave_type_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "staff_leave_applications_institute_id_staff_id_idx" ON "staff_leave_applications"("institute_id", "staff_id");
CREATE INDEX "staff_leave_applications_institute_id_status_idx" ON "staff_leave_applications"("institute_id", "status");

CREATE TABLE "staff_notifications" (
  "notification_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" INTEGER NOT NULL,
  "event_type" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'in_app',
  "recipient" TEXT,
  "message" TEXT,
  "status" "StaffNotificationStatus" NOT NULL DEFAULT 'queued',
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "staff_notifications_institute_id_event_type_idx" ON "staff_notifications"("institute_id", "event_type");
CREATE INDEX "staff_notifications_entity_type_entity_id_idx" ON "staff_notifications"("entity_type", "entity_id");
