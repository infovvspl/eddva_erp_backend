-- CreateEnum
CREATE TYPE "HostelGenderType" AS ENUM ('boys', 'girls', 'mixed');

-- CreateEnum
CREATE TYPE "HostelResidentGender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "HostelRoomType" AS ENUM ('single', 'double', 'triple', 'dormitory');

-- CreateEnum
CREATE TYPE "HostelRoomStatus" AS ENUM ('available', 'full', 'under_maintenance');

-- CreateEnum
CREATE TYPE "HostelBedStatus" AS ENUM ('vacant', 'occupied');

-- CreateEnum
CREATE TYPE "HostelResidentStatus" AS ENUM ('active', 'vacated', 'suspended');

-- CreateEnum
CREATE TYPE "HostelAllotmentStatus" AS ENUM ('active', 'vacated', 'transferred');

-- CreateEnum
CREATE TYPE "HostelTransferStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "HostelGatePassType" AS ENUM ('day_outing', 'weekend_leave', 'home_leave', 'medical');

-- CreateEnum
CREATE TYPE "HostelGatePassStatus" AS ENUM ('pending', 'approved', 'rejected', 'out', 'returned', 'overdue', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "HostelAttendanceSession" AS ENUM ('morning', 'night');

-- CreateEnum
CREATE TYPE "HostelAttendanceStatus" AS ENUM ('present', 'absent', 'on_leave');

-- CreateEnum
CREATE TYPE "HostelMealType" AS ENUM ('breakfast', 'lunch', 'snacks', 'dinner');

-- CreateEnum
CREATE TYPE "HostelDayOfWeek" AS ENUM ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');

-- CreateEnum
CREATE TYPE "HostelMealAttendanceStatus" AS ENUM ('opted_in', 'opted_out', 'consumed', 'missed');

-- CreateEnum
CREATE TYPE "HostelComplaintCategory" AS ENUM ('electrical', 'plumbing', 'furniture', 'cleanliness', 'internet', 'other');

-- CreateEnum
CREATE TYPE "HostelComplaintPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "HostelComplaintStatus" AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "HostelBillingCycle" AS ENUM ('monthly', 'quarterly', 'annual');

-- CreateEnum
CREATE TYPE "HostelInvoicePaymentStatus" AS ENUM ('unpaid', 'partially_paid', 'paid');

-- CreateEnum
CREATE TYPE "HostelPaymentMode" AS ENUM ('cash', 'card', 'upi', 'bank_transfer');

-- CreateEnum
CREATE TYPE "HostelDisciplineCategory" AS ENUM ('curfew_violation', 'misconduct', 'property_damage', 'other');

-- CreateEnum
CREATE TYPE "HostelDisciplineAction" AS ENUM ('warning', 'fine', 'parent_notified', 'suspension');

-- CreateEnum
CREATE TYPE "HostelNotificationChannel" AS ENUM ('email', 'sms', 'in_app');

-- CreateEnum
CREATE TYPE "HostelNotificationAudience" AS ENUM ('guardian', 'staff');

-- CreateEnum
CREATE TYPE "HostelNotificationStatus" AS ENUM ('queued', 'sent', 'failed');

-- CreateTable
CREATE TABLE "hostel_blocks" (
    "block_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender_type" "HostelGenderType" NOT NULL,
    "total_floors" INTEGER NOT NULL DEFAULT 1,
    "warden_user_id" TEXT,
    "warden_name" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "hostel_blocks_pkey" PRIMARY KEY ("block_id")
);

-- CreateTable
CREATE TABLE "hostel_rooms" (
    "room_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "block_id" INTEGER NOT NULL,
    "room_number" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "room_type" "HostelRoomType" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "HostelRoomStatus" NOT NULL DEFAULT 'available',
    "description" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "hostel_rooms_pkey" PRIMARY KEY ("room_id")
);

-- CreateTable
CREATE TABLE "hostel_beds" (
    "bed_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "room_id" INTEGER NOT NULL,
    "bed_number" TEXT NOT NULL,
    "status" "HostelBedStatus" NOT NULL DEFAULT 'vacant',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "hostel_beds_pkey" PRIMARY KEY ("bed_id")
);

-- CreateTable
CREATE TABLE "hostel_residents" (
    "resident_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "student_ref" TEXT NOT NULL,
    "admission_no" TEXT,
    "student_name" TEXT NOT NULL,
    "gender" "HostelResidentGender" NOT NULL,
    "grade" TEXT,
    "guardian_name" TEXT NOT NULL,
    "guardian_phone" TEXT NOT NULL,
    "guardian_email" TEXT,
    "status" "HostelResidentStatus" NOT NULL DEFAULT 'active',
    "admitted_on" DATE NOT NULL,
    "vacated_on" DATE,
    "status_reason" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hostel_residents_pkey" PRIMARY KEY ("resident_id")
);

-- CreateTable
CREATE TABLE "hostel_room_allotments" (
    "allotment_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "resident_id" INTEGER NOT NULL,
    "room_id" INTEGER NOT NULL,
    "bed_id" INTEGER,
    "academic_year" TEXT NOT NULL,
    "allotment_date" DATE NOT NULL,
    "vacate_date" DATE,
    "status" "HostelAllotmentStatus" NOT NULL DEFAULT 'active',
    "allotted_by" TEXT NOT NULL,
    "closed_by" TEXT,
    "close_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hostel_room_allotments_pkey" PRIMARY KEY ("allotment_id")
);

-- CreateTable
CREATE TABLE "hostel_transfer_requests" (
    "transfer_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "resident_id" INTEGER NOT NULL,
    "current_allotment_id" INTEGER NOT NULL,
    "current_room_id" INTEGER NOT NULL,
    "requested_room_id" INTEGER NOT NULL,
    "requested_bed_id" INTEGER,
    "reason" TEXT NOT NULL,
    "status" "HostelTransferStatus" NOT NULL DEFAULT 'pending',
    "requested_by" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_remarks" TEXT,
    "new_allotment_id" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hostel_transfer_requests_pkey" PRIMARY KEY ("transfer_id")
);

-- CreateTable
CREATE TABLE "hostel_gate_passes" (
    "gate_pass_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "pass_no" TEXT NOT NULL,
    "resident_id" INTEGER NOT NULL,
    "pass_type" "HostelGatePassType" NOT NULL,
    "reason" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "requested_out_at" TIMESTAMP(3) NOT NULL,
    "expected_return_at" TIMESTAMP(3) NOT NULL,
    "actual_out_at" TIMESTAMP(3),
    "actual_return_at" TIMESTAMP(3),
    "status" "HostelGatePassStatus" NOT NULL DEFAULT 'pending',
    "requested_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "rejected_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_remarks" TEXT,
    "scanned_out_by" TEXT,
    "scanned_in_by" TEXT,
    "overdue_at" TIMESTAMP(3),
    "overdue_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hostel_gate_passes_pkey" PRIMARY KEY ("gate_pass_id")
);

-- CreateTable
CREATE TABLE "hostel_attendance" (
    "attendance_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "resident_id" INTEGER NOT NULL,
    "attendance_date" DATE NOT NULL,
    "session" "HostelAttendanceSession" NOT NULL,
    "status" "HostelAttendanceStatus" NOT NULL,
    "remarks" TEXT,
    "marked_by" TEXT NOT NULL,
    "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "unaccounted_notified_at" TIMESTAMP(3),

    CONSTRAINT "hostel_attendance_pkey" PRIMARY KEY ("attendance_id")
);

-- CreateTable
CREATE TABLE "hostel_visitor_logs" (
    "visitor_log_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "resident_id" INTEGER NOT NULL,
    "visitor_name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "purpose" TEXT,
    "id_proof_type" TEXT,
    "id_proof_masked" TEXT,
    "id_proof_encrypted" TEXT,
    "in_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "out_time" TIMESTAMP(3),
    "recorded_by" TEXT NOT NULL,
    "checked_out_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hostel_visitor_logs_pkey" PRIMARY KEY ("visitor_log_id")
);

-- CreateTable
CREATE TABLE "hostel_mess_menus" (
    "menu_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "day_of_week" "HostelDayOfWeek" NOT NULL,
    "meal_type" "HostelMealType" NOT NULL,
    "items" TEXT[],
    "effective_from" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hostel_mess_menus_pkey" PRIMARY KEY ("menu_id")
);

-- CreateTable
CREATE TABLE "hostel_mess_attendance" (
    "mess_attendance_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "resident_id" INTEGER NOT NULL,
    "meal_date" DATE NOT NULL,
    "meal_type" "HostelMealType" NOT NULL,
    "status" "HostelMealAttendanceStatus" NOT NULL,
    "marked_by" TEXT NOT NULL,
    "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hostel_mess_attendance_pkey" PRIMARY KEY ("mess_attendance_id")
);

-- CreateTable
CREATE TABLE "hostel_complaints" (
    "complaint_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "resident_id" INTEGER,
    "room_id" INTEGER,
    "category" "HostelComplaintCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "HostelComplaintPriority" NOT NULL DEFAULT 'medium',
    "status" "HostelComplaintStatus" NOT NULL DEFAULT 'open',
    "assigned_to" TEXT,
    "assigned_to_name" TEXT,
    "resolution_notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hostel_complaints_pkey" PRIMARY KEY ("complaint_id")
);

-- CreateTable
CREATE TABLE "hostel_complaint_updates" (
    "update_id" SERIAL NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,
    "status_change" TEXT,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_complaint_updates_pkey" PRIMARY KEY ("update_id")
);

-- CreateTable
CREATE TABLE "hostel_fee_plans" (
    "fee_plan_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room_type" "HostelRoomType" NOT NULL,
    "includes_mess" BOOLEAN NOT NULL DEFAULT false,
    "amount" DECIMAL(12,2) NOT NULL,
    "billing_cycle" "HostelBillingCycle" NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "hostel_fee_plans_pkey" PRIMARY KEY ("fee_plan_id")
);

-- CreateTable
CREATE TABLE "hostel_fee_invoices" (
    "invoice_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "resident_id" INTEGER NOT NULL,
    "fee_plan_id" INTEGER NOT NULL,
    "plan_name" TEXT NOT NULL,
    "room_type" "HostelRoomType" NOT NULL,
    "includes_mess" BOOLEAN NOT NULL,
    "billing_cycle" "HostelBillingCycle" NOT NULL,
    "billing_period" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "amount_due" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_status" "HostelInvoicePaymentStatus" NOT NULL DEFAULT 'unpaid',
    "issued_on" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "remarks" TEXT,
    "overdue_notified_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "cancel_reason" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hostel_fee_invoices_pkey" PRIMARY KEY ("invoice_id")
);

-- CreateTable
CREATE TABLE "hostel_fee_payments" (
    "payment_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "resident_id" INTEGER NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_mode" "HostelPaymentMode" NOT NULL,
    "transaction_ref" TEXT,
    "received_by" TEXT NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_fee_payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "hostel_discipline_records" (
    "record_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "resident_id" INTEGER NOT NULL,
    "incident_date" DATE NOT NULL,
    "category" "HostelDisciplineCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "action_taken" "HostelDisciplineAction" NOT NULL,
    "fine_amount" DECIMAL(12,2),
    "gate_pass_id" INTEGER,
    "recorded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hostel_discipline_records_pkey" PRIMARY KEY ("record_id")
);

-- CreateTable
CREATE TABLE "hostel_notifications" (
    "notification_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "audience" "HostelNotificationAudience" NOT NULL,
    "channel" "HostelNotificationChannel" NOT NULL DEFAULT 'sms',
    "recipient" TEXT,
    "message" TEXT,
    "status" "HostelNotificationStatus" NOT NULL DEFAULT 'queued',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "hostel_dynamic_roles" (
    "role_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hostel_dynamic_roles_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "hostel_user_dynamic_roles" (
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

    CONSTRAINT "hostel_user_dynamic_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_sso_sessions" (
    "session_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "eddva_user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT,
    "user_role" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_sso_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "hostel_permissions_catalog" (
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

    CONSTRAINT "hostel_permissions_catalog_pkey" PRIMARY KEY ("permission_id")
);

-- CreateTable
CREATE TABLE "hostel_number_sequences" (
    "id" SERIAL NOT NULL,
    "sequence_type" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "current_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "hostel_number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hostel_blocks_institute_id_is_active_idx" ON "hostel_blocks"("institute_id", "is_active");

-- CreateIndex
CREATE INDEX "hostel_blocks_institute_id_gender_type_idx" ON "hostel_blocks"("institute_id", "gender_type");

-- CreateIndex
CREATE INDEX "hostel_rooms_block_id_floor_idx" ON "hostel_rooms"("block_id", "floor");

-- CreateIndex
CREATE INDEX "hostel_rooms_institute_id_status_idx" ON "hostel_rooms"("institute_id", "status");

-- CreateIndex
CREATE INDEX "hostel_rooms_institute_id_room_type_idx" ON "hostel_rooms"("institute_id", "room_type");

-- CreateIndex
CREATE INDEX "hostel_beds_room_id_status_idx" ON "hostel_beds"("room_id", "status");

-- CreateIndex
CREATE INDEX "hostel_beds_institute_id_status_idx" ON "hostel_beds"("institute_id", "status");

-- CreateIndex
CREATE INDEX "hostel_residents_institute_id_status_idx" ON "hostel_residents"("institute_id", "status");

-- CreateIndex
CREATE INDEX "hostel_residents_institute_id_student_name_idx" ON "hostel_residents"("institute_id", "student_name");

-- CreateIndex
CREATE INDEX "hostel_residents_institute_id_admission_no_idx" ON "hostel_residents"("institute_id", "admission_no");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_residents_institute_id_student_ref_key" ON "hostel_residents"("institute_id", "student_ref");

-- CreateIndex
CREATE INDEX "hostel_room_allotments_resident_id_status_idx" ON "hostel_room_allotments"("resident_id", "status");

-- CreateIndex
CREATE INDEX "hostel_room_allotments_room_id_status_idx" ON "hostel_room_allotments"("room_id", "status");

-- CreateIndex
CREATE INDEX "hostel_room_allotments_bed_id_status_idx" ON "hostel_room_allotments"("bed_id", "status");

-- CreateIndex
CREATE INDEX "hostel_room_allotments_institute_id_academic_year_idx" ON "hostel_room_allotments"("institute_id", "academic_year");

-- CreateIndex
CREATE INDEX "hostel_transfer_requests_resident_id_status_idx" ON "hostel_transfer_requests"("resident_id", "status");

-- CreateIndex
CREATE INDEX "hostel_transfer_requests_institute_id_status_requested_at_idx" ON "hostel_transfer_requests"("institute_id", "status", "requested_at");

-- CreateIndex
CREATE INDEX "hostel_gate_passes_resident_id_status_idx" ON "hostel_gate_passes"("resident_id", "status");

-- CreateIndex
CREATE INDEX "hostel_gate_passes_status_expected_return_at_idx" ON "hostel_gate_passes"("status", "expected_return_at");

-- CreateIndex
CREATE INDEX "hostel_gate_passes_actual_return_at_idx" ON "hostel_gate_passes"("actual_return_at");

-- CreateIndex
CREATE INDEX "hostel_gate_passes_institute_id_status_requested_out_at_idx" ON "hostel_gate_passes"("institute_id", "status", "requested_out_at");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_gate_passes_institute_id_pass_no_key" ON "hostel_gate_passes"("institute_id", "pass_no");

-- CreateIndex
CREATE INDEX "hostel_attendance_institute_id_attendance_date_status_idx" ON "hostel_attendance"("institute_id", "attendance_date", "status");

-- CreateIndex
CREATE INDEX "hostel_attendance_institute_id_attendance_date_session_idx" ON "hostel_attendance"("institute_id", "attendance_date", "session");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_attendance_resident_id_attendance_date_session_key" ON "hostel_attendance"("resident_id", "attendance_date", "session");

-- CreateIndex
CREATE INDEX "hostel_visitor_logs_resident_id_in_time_idx" ON "hostel_visitor_logs"("resident_id", "in_time");

-- CreateIndex
CREATE INDEX "hostel_visitor_logs_institute_id_in_time_idx" ON "hostel_visitor_logs"("institute_id", "in_time");

-- CreateIndex
CREATE INDEX "hostel_visitor_logs_institute_id_out_time_idx" ON "hostel_visitor_logs"("institute_id", "out_time");

-- CreateIndex
CREATE INDEX "hostel_mess_menus_institute_id_is_active_effective_from_idx" ON "hostel_mess_menus"("institute_id", "is_active", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_mess_menus_institute_id_day_of_week_meal_type_effect_key" ON "hostel_mess_menus"("institute_id", "day_of_week", "meal_type", "effective_from");

-- CreateIndex
CREATE INDEX "hostel_mess_attendance_institute_id_meal_date_meal_type_sta_idx" ON "hostel_mess_attendance"("institute_id", "meal_date", "meal_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_mess_attendance_resident_id_meal_date_meal_type_key" ON "hostel_mess_attendance"("resident_id", "meal_date", "meal_type");

-- CreateIndex
CREATE INDEX "hostel_complaints_resident_id_status_idx" ON "hostel_complaints"("resident_id", "status");

-- CreateIndex
CREATE INDEX "hostel_complaints_institute_id_status_priority_idx" ON "hostel_complaints"("institute_id", "status", "priority");

-- CreateIndex
CREATE INDEX "hostel_complaints_assigned_to_status_idx" ON "hostel_complaints"("assigned_to", "status");

-- CreateIndex
CREATE INDEX "hostel_complaints_room_id_idx" ON "hostel_complaints"("room_id");

-- CreateIndex
CREATE INDEX "hostel_complaint_updates_complaint_id_idx" ON "hostel_complaint_updates"("complaint_id");

-- CreateIndex
CREATE INDEX "hostel_fee_plans_institute_id_room_type_is_active_idx" ON "hostel_fee_plans"("institute_id", "room_type", "is_active");

-- CreateIndex
CREATE INDEX "hostel_fee_invoices_resident_id_period_start_idx" ON "hostel_fee_invoices"("resident_id", "period_start");

-- CreateIndex
CREATE INDEX "hostel_fee_invoices_institute_id_payment_status_idx" ON "hostel_fee_invoices"("institute_id", "payment_status");

-- CreateIndex
CREATE INDEX "hostel_fee_invoices_institute_id_due_date_idx" ON "hostel_fee_invoices"("institute_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_fee_invoices_institute_id_invoice_no_key" ON "hostel_fee_invoices"("institute_id", "invoice_no");

-- CreateIndex
CREATE INDEX "hostel_fee_payments_invoice_id_idx" ON "hostel_fee_payments"("invoice_id");

-- CreateIndex
CREATE INDEX "hostel_fee_payments_institute_id_payment_date_idx" ON "hostel_fee_payments"("institute_id", "payment_date");

-- CreateIndex
CREATE INDEX "hostel_fee_payments_resident_id_idx" ON "hostel_fee_payments"("resident_id");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_fee_payments_institute_id_receipt_no_key" ON "hostel_fee_payments"("institute_id", "receipt_no");

-- CreateIndex
CREATE INDEX "hostel_discipline_records_resident_id_incident_date_idx" ON "hostel_discipline_records"("resident_id", "incident_date");

-- CreateIndex
CREATE INDEX "hostel_discipline_records_institute_id_category_incident_da_idx" ON "hostel_discipline_records"("institute_id", "category", "incident_date");

-- CreateIndex
CREATE INDEX "hostel_discipline_records_gate_pass_id_idx" ON "hostel_discipline_records"("gate_pass_id");

-- CreateIndex
CREATE INDEX "hostel_notifications_institute_id_event_type_idx" ON "hostel_notifications"("institute_id", "event_type");

-- CreateIndex
CREATE INDEX "hostel_notifications_entity_type_entity_id_idx" ON "hostel_notifications"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_dynamic_roles_institute_id_name_key" ON "hostel_dynamic_roles"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_user_dynamic_roles_institute_id_eddva_user_id_key" ON "hostel_user_dynamic_roles"("institute_id", "eddva_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_user_dynamic_roles_institute_id_username_key" ON "hostel_user_dynamic_roles"("institute_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_sso_sessions_token_hash_key" ON "hostel_sso_sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_permissions_catalog_key_key" ON "hostel_permissions_catalog"("key");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_number_sequences_sequence_type_financial_year_key" ON "hostel_number_sequences"("sequence_type", "financial_year");

-- AddForeignKey
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "hostel_blocks"("block_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_beds" ADD CONSTRAINT "hostel_beds_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "hostel_rooms"("room_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_room_allotments" ADD CONSTRAINT "hostel_room_allotments_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "hostel_residents"("resident_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_room_allotments" ADD CONSTRAINT "hostel_room_allotments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "hostel_rooms"("room_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_room_allotments" ADD CONSTRAINT "hostel_room_allotments_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "hostel_beds"("bed_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_transfer_requests" ADD CONSTRAINT "hostel_transfer_requests_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "hostel_residents"("resident_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_transfer_requests" ADD CONSTRAINT "hostel_transfer_requests_current_allotment_id_fkey" FOREIGN KEY ("current_allotment_id") REFERENCES "hostel_room_allotments"("allotment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_transfer_requests" ADD CONSTRAINT "hostel_transfer_requests_current_room_id_fkey" FOREIGN KEY ("current_room_id") REFERENCES "hostel_rooms"("room_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_transfer_requests" ADD CONSTRAINT "hostel_transfer_requests_requested_room_id_fkey" FOREIGN KEY ("requested_room_id") REFERENCES "hostel_rooms"("room_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_transfer_requests" ADD CONSTRAINT "hostel_transfer_requests_new_allotment_id_fkey" FOREIGN KEY ("new_allotment_id") REFERENCES "hostel_room_allotments"("allotment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_gate_passes" ADD CONSTRAINT "hostel_gate_passes_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "hostel_residents"("resident_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_attendance" ADD CONSTRAINT "hostel_attendance_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "hostel_residents"("resident_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_visitor_logs" ADD CONSTRAINT "hostel_visitor_logs_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "hostel_residents"("resident_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_mess_attendance" ADD CONSTRAINT "hostel_mess_attendance_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "hostel_residents"("resident_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_complaints" ADD CONSTRAINT "hostel_complaints_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "hostel_residents"("resident_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_complaints" ADD CONSTRAINT "hostel_complaints_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "hostel_rooms"("room_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_complaint_updates" ADD CONSTRAINT "hostel_complaint_updates_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "hostel_complaints"("complaint_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_fee_invoices" ADD CONSTRAINT "hostel_fee_invoices_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "hostel_residents"("resident_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_fee_invoices" ADD CONSTRAINT "hostel_fee_invoices_fee_plan_id_fkey" FOREIGN KEY ("fee_plan_id") REFERENCES "hostel_fee_plans"("fee_plan_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_fee_payments" ADD CONSTRAINT "hostel_fee_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "hostel_fee_invoices"("invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_fee_payments" ADD CONSTRAINT "hostel_fee_payments_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "hostel_residents"("resident_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_discipline_records" ADD CONSTRAINT "hostel_discipline_records_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "hostel_residents"("resident_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_discipline_records" ADD CONSTRAINT "hostel_discipline_records_gate_pass_id_fkey" FOREIGN KEY ("gate_pass_id") REFERENCES "hostel_gate_passes"("gate_pass_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_user_dynamic_roles" ADD CONSTRAINT "hostel_user_dynamic_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "hostel_dynamic_roles"("role_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── Invariants Prisma cannot express (partial unique indexes and CHECK constraints) ───

-- A resident has at most one ACTIVE allotment, and a bed is held by at most one ACTIVE allotment.
CREATE UNIQUE INDEX "hostel_room_allotments_one_active_per_resident_key"
    ON "hostel_room_allotments"("resident_id") WHERE "status" = 'active';
CREATE UNIQUE INDEX "hostel_room_allotments_one_active_per_bed_key"
    ON "hostel_room_allotments"("bed_id") WHERE "status" = 'active' AND "bed_id" IS NOT NULL;

-- Live (non soft-deleted) names/numbers are unique; soft-deleted rows free their name.
CREATE UNIQUE INDEX "hostel_blocks_live_name_key"
    ON "hostel_blocks"("institute_id", lower("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "hostel_rooms_live_number_key"
    ON "hostel_rooms"("block_id", lower("room_number")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "hostel_beds_live_number_key"
    ON "hostel_beds"("room_id", lower("bed_number")) WHERE "deleted_at" IS NULL;

-- One non-cancelled invoice per resident per billing period.
CREATE UNIQUE INDEX "hostel_fee_invoices_live_period_key"
    ON "hostel_fee_invoices"("resident_id", "period_start", "period_end") WHERE "cancelled_at" IS NULL;

-- Sanity bounds enforced by the database as well as the application.
ALTER TABLE "hostel_blocks" ADD CONSTRAINT "hostel_blocks_total_floors_check" CHECK ("total_floors" >= 1);
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_capacity_check" CHECK ("capacity" >= 1 AND "floor" >= 0);
ALTER TABLE "hostel_gate_passes" ADD CONSTRAINT "hostel_gate_passes_window_check" CHECK ("expected_return_at" > "requested_out_at");
ALTER TABLE "hostel_fee_plans" ADD CONSTRAINT "hostel_fee_plans_amount_check" CHECK ("amount" > 0);
ALTER TABLE "hostel_fee_invoices" ADD CONSTRAINT "hostel_fee_invoices_amounts_check"
    CHECK ("amount_due" > 0 AND "amount_paid" >= 0 AND "amount_paid" <= "amount_due");
ALTER TABLE "hostel_fee_payments" ADD CONSTRAINT "hostel_fee_payments_amount_check" CHECK ("amount_paid" > 0);
