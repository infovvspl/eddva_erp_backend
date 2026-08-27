-- CreateEnum
CREATE TYPE "FrontOfficeVisitorLogStatus" AS ENUM ('checked_in', 'checked_out');

-- CreateEnum
CREATE TYPE "FrontOfficeEnquirySource" AS ENUM ('walk_in', 'phone', 'email', 'website');

-- CreateEnum
CREATE TYPE "FrontOfficeEnquiryStatus" AS ENUM ('open', 'in_progress', 'closed');

-- CreateEnum
CREATE TYPE "FrontOfficeAppointmentStatus" AS ENUM ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "FrontOfficeComplaintPriority" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "FrontOfficeComplaintStatus" AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "FrontOfficeAttachmentEntityType" AS ENUM ('visitor', 'enquiry', 'complaint');

-- CreateEnum
CREATE TYPE "FrontOfficeNotificationEntityType" AS ENUM ('visitor', 'enquiry', 'appointment', 'complaint');

-- CreateEnum
CREATE TYPE "FrontOfficeNotificationChannel" AS ENUM ('sms', 'email', 'push');

-- CreateEnum
CREATE TYPE "FrontOfficeNotificationStatus" AS ENUM ('queued', 'sent', 'failed');

-- CreateTable
CREATE TABLE "front_office_departments" (
    "department_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "front_office_departments_pkey" PRIMARY KEY ("department_id")
);

-- CreateTable
CREATE TABLE "front_office_employees" (
    "employee_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "department_id" INTEGER NOT NULL,
    "designation" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "front_office_employees_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "front_office_availability_slots" (
    "slot_id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "front_office_availability_slots_pkey" PRIMARY KEY ("slot_id")
);

-- CreateTable
CREATE TABLE "front_office_visitors" (
    "visitor_id" SERIAL NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "id_proof_type" TEXT,
    "id_proof_number" TEXT,
    "photo_url" TEXT,
    "organization" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "front_office_visitors_pkey" PRIMARY KEY ("visitor_id")
);

-- CreateTable
CREATE TABLE "front_office_visitor_logs" (
    "log_id" SERIAL NOT NULL,
    "visitor_id" INTEGER NOT NULL,
    "host_employee_id" INTEGER NOT NULL,
    "appointment_id" INTEGER,
    "purpose" TEXT,
    "badge_number" TEXT NOT NULL,
    "check_in_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "check_out_time" TIMESTAMP(3),
    "status" "FrontOfficeVisitorLogStatus" NOT NULL DEFAULT 'checked_in',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "front_office_visitor_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "front_office_enquiries" (
    "enquiry_id" SERIAL NOT NULL,
    "enquirer_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "source" "FrontOfficeEnquirySource" NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assigned_to" INTEGER,
    "status" "FrontOfficeEnquiryStatus" NOT NULL DEFAULT 'open',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "front_office_enquiries_pkey" PRIMARY KEY ("enquiry_id")
);

-- CreateTable
CREATE TABLE "front_office_enquiry_followups" (
    "followup_id" SERIAL NOT NULL,
    "enquiry_id" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,
    "followup_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_followup_date" TIMESTAMP(3),
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "front_office_enquiry_followups_pkey" PRIMARY KEY ("followup_id")
);

-- CreateTable
CREATE TABLE "front_office_appointments" (
    "appointment_id" SERIAL NOT NULL,
    "visitor_id" INTEGER,
    "visitor_name" TEXT NOT NULL,
    "phone" TEXT,
    "host_employee_id" INTEGER NOT NULL,
    "department_id" INTEGER NOT NULL,
    "appointment_date" DATE NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT,
    "status" "FrontOfficeAppointmentStatus" NOT NULL DEFAULT 'scheduled',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "front_office_appointments_pkey" PRIMARY KEY ("appointment_id")
);

-- CreateTable
CREATE TABLE "front_office_complaints" (
    "complaint_id" SERIAL NOT NULL,
    "complainant_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "FrontOfficeComplaintPriority" NOT NULL DEFAULT 'medium',
    "status" "FrontOfficeComplaintStatus" NOT NULL DEFAULT 'open',
    "assigned_to" INTEGER,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "front_office_complaints_pkey" PRIMARY KEY ("complaint_id")
);

-- CreateTable
CREATE TABLE "front_office_complaint_updates" (
    "update_id" SERIAL NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,
    "status_change" TEXT,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "front_office_complaint_updates_pkey" PRIMARY KEY ("update_id")
);

-- CreateTable
CREATE TABLE "front_office_attachments" (
    "attachment_id" SERIAL NOT NULL,
    "entity_type" "FrontOfficeAttachmentEntityType" NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "uploaded_by" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "front_office_attachments_pkey" PRIMARY KEY ("attachment_id")
);

-- CreateTable
CREATE TABLE "front_office_notifications" (
    "notification_id" SERIAL NOT NULL,
    "entity_type" "FrontOfficeNotificationEntityType" NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "recipient_employee_id" INTEGER,
    "channel" "FrontOfficeNotificationChannel" NOT NULL DEFAULT 'email',
    "status" "FrontOfficeNotificationStatus" NOT NULL DEFAULT 'queued',
    "message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "front_office_notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "front_office_departments_name_key" ON "front_office_departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "front_office_employees_email_key" ON "front_office_employees"("email");

-- CreateIndex
CREATE INDEX "front_office_employees_department_id_idx" ON "front_office_employees"("department_id");

-- CreateIndex
CREATE INDEX "front_office_availability_slots_employee_id_date_idx" ON "front_office_availability_slots"("employee_id", "date");

-- CreateIndex
CREATE INDEX "front_office_visitors_phone_idx" ON "front_office_visitors"("phone");

-- CreateIndex
CREATE INDEX "front_office_visitors_email_idx" ON "front_office_visitors"("email");

-- CreateIndex
CREATE INDEX "front_office_visitors_full_name_idx" ON "front_office_visitors"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "front_office_visitor_logs_appointment_id_key" ON "front_office_visitor_logs"("appointment_id");

-- CreateIndex
CREATE INDEX "front_office_visitor_logs_visitor_id_idx" ON "front_office_visitor_logs"("visitor_id");

-- CreateIndex
CREATE INDEX "front_office_visitor_logs_host_employee_id_idx" ON "front_office_visitor_logs"("host_employee_id");

-- CreateIndex
CREATE INDEX "front_office_visitor_logs_status_idx" ON "front_office_visitor_logs"("status");

-- CreateIndex
CREATE INDEX "front_office_visitor_logs_check_in_time_idx" ON "front_office_visitor_logs"("check_in_time");

-- CreateIndex
CREATE INDEX "front_office_enquiries_phone_idx" ON "front_office_enquiries"("phone");

-- CreateIndex
CREATE INDEX "front_office_enquiries_email_idx" ON "front_office_enquiries"("email");

-- CreateIndex
CREATE INDEX "front_office_enquiries_status_created_at_idx" ON "front_office_enquiries"("status", "created_at");

-- CreateIndex
CREATE INDEX "front_office_enquiries_assigned_to_status_idx" ON "front_office_enquiries"("assigned_to", "status");

-- CreateIndex
CREATE INDEX "front_office_enquiry_followups_enquiry_id_idx" ON "front_office_enquiry_followups"("enquiry_id");

-- CreateIndex
CREATE INDEX "front_office_enquiry_followups_next_followup_date_idx" ON "front_office_enquiry_followups"("next_followup_date");

-- CreateIndex
CREATE INDEX "front_office_appointments_host_employee_id_appointment_date_idx" ON "front_office_appointments"("host_employee_id", "appointment_date");

-- CreateIndex
CREATE INDEX "front_office_appointments_appointment_date_status_idx" ON "front_office_appointments"("appointment_date", "status");

-- CreateIndex
CREATE INDEX "front_office_appointments_visitor_id_idx" ON "front_office_appointments"("visitor_id");

-- CreateIndex
CREATE INDEX "front_office_appointments_department_id_idx" ON "front_office_appointments"("department_id");

-- CreateIndex
CREATE INDEX "front_office_complaints_phone_idx" ON "front_office_complaints"("phone");

-- CreateIndex
CREATE INDEX "front_office_complaints_email_idx" ON "front_office_complaints"("email");

-- CreateIndex
CREATE INDEX "front_office_complaints_status_created_at_idx" ON "front_office_complaints"("status", "created_at");

-- CreateIndex
CREATE INDEX "front_office_complaints_assigned_to_status_idx" ON "front_office_complaints"("assigned_to", "status");

-- CreateIndex
CREATE INDEX "front_office_complaints_priority_idx" ON "front_office_complaints"("priority");

-- CreateIndex
CREATE INDEX "front_office_complaint_updates_complaint_id_idx" ON "front_office_complaint_updates"("complaint_id");

-- CreateIndex
CREATE INDEX "front_office_attachments_entity_type_entity_id_idx" ON "front_office_attachments"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "front_office_notifications_entity_type_entity_id_idx" ON "front_office_notifications"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "front_office_notifications_recipient_employee_id_idx" ON "front_office_notifications"("recipient_employee_id");

-- AddForeignKey
ALTER TABLE "front_office_employees" ADD CONSTRAINT "front_office_employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "front_office_departments"("department_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_availability_slots" ADD CONSTRAINT "front_office_availability_slots_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "front_office_employees"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_visitors" ADD CONSTRAINT "front_office_visitors_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_visitor_logs" ADD CONSTRAINT "front_office_visitor_logs_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "front_office_visitors"("visitor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_visitor_logs" ADD CONSTRAINT "front_office_visitor_logs_host_employee_id_fkey" FOREIGN KEY ("host_employee_id") REFERENCES "front_office_employees"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_visitor_logs" ADD CONSTRAINT "front_office_visitor_logs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "front_office_appointments"("appointment_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_visitor_logs" ADD CONSTRAINT "front_office_visitor_logs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_enquiries" ADD CONSTRAINT "front_office_enquiries_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "front_office_employees"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_enquiries" ADD CONSTRAINT "front_office_enquiries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_enquiry_followups" ADD CONSTRAINT "front_office_enquiry_followups_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "front_office_enquiries"("enquiry_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_enquiry_followups" ADD CONSTRAINT "front_office_enquiry_followups_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_appointments" ADD CONSTRAINT "front_office_appointments_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "front_office_visitors"("visitor_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_appointments" ADD CONSTRAINT "front_office_appointments_host_employee_id_fkey" FOREIGN KEY ("host_employee_id") REFERENCES "front_office_employees"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_appointments" ADD CONSTRAINT "front_office_appointments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "front_office_departments"("department_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_appointments" ADD CONSTRAINT "front_office_appointments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_complaints" ADD CONSTRAINT "front_office_complaints_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "front_office_employees"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_complaints" ADD CONSTRAINT "front_office_complaints_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_complaint_updates" ADD CONSTRAINT "front_office_complaint_updates_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "front_office_complaints"("complaint_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_complaint_updates" ADD CONSTRAINT "front_office_complaint_updates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_attachments" ADD CONSTRAINT "front_office_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "front_office_notifications" ADD CONSTRAINT "front_office_notifications_recipient_employee_id_fkey" FOREIGN KEY ("recipient_employee_id") REFERENCES "front_office_employees"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Concurrency safety: only one CHECKED_IN visitor_log may hold a given badge
-- at a time, and a visitor may not have two simultaneous active visits.
-- Partial unique indexes enforce this at the DB level regardless of how many
-- concurrent check-in requests race each other (app-level pre-check in
-- VisitorLogsService is a UX nicety; this index is the real guarantee).
CREATE UNIQUE INDEX "front_office_visitor_logs_active_badge_unique" ON "front_office_visitor_logs" ("badge_number") WHERE "status" = 'checked_in';
CREATE UNIQUE INDEX "front_office_visitor_logs_active_visitor_unique" ON "front_office_visitor_logs" ("visitor_id") WHERE "status" = 'checked_in';
