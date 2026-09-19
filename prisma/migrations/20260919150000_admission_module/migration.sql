-- CreateEnum
CREATE TYPE "AdmissionSessionStatus" AS ENUM ('upcoming', 'active', 'closed');

-- CreateEnum
CREATE TYPE "AdmissionGender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "AdmissionEnquirySource" AS ENUM ('walk_in', 'website', 'referral', 'agent', 'advertisement');

-- CreateEnum
CREATE TYPE "AdmissionEnquiryStatus" AS ENUM ('new', 'contacted', 'application_started', 'converted', 'lost');

-- CreateEnum
CREATE TYPE "AdmissionApplicationStatus" AS ENUM ('draft', 'submitted', 'under_review', 'test_scheduled', 'shortlisted', 'waitlisted', 'rejected', 'offered', 'admitted', 'cancelled');

-- CreateEnum
CREATE TYPE "AdmissionDocumentType" AS ENUM ('birth_certificate', 'previous_marksheet', 'transfer_certificate', 'id_proof', 'photo', 'other');

-- CreateEnum
CREATE TYPE "AdmissionVerificationStatus" AS ENUM ('pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "AdmissionPaymentMode" AS ENUM ('card', 'upi', 'bank_transfer', 'cash');

-- CreateEnum
CREATE TYPE "AdmissionFeePaymentStatus" AS ENUM ('success', 'pending', 'failed');

-- CreateEnum
CREATE TYPE "AdmissionTestMode" AS ENUM ('online', 'offline');

-- CreateEnum
CREATE TYPE "AdmissionTestRegistrationStatus" AS ENUM ('registered', 'appeared', 'absent');

-- CreateEnum
CREATE TYPE "AdmissionInterviewMode" AS ENUM ('online', 'offline');

-- CreateEnum
CREATE TYPE "AdmissionInterviewStatus" AS ENUM ('scheduled', 'completed', 'no_show', 'rescheduled');

-- CreateEnum
CREATE TYPE "AdmissionRecommendation" AS ENUM ('recommend', 'not_recommend', 'waitlist');

-- CreateEnum
CREATE TYPE "AdmissionMeritOutcome" AS ENUM ('selected', 'waitlisted', 'not_selected');

-- CreateEnum
CREATE TYPE "AdmissionOfferStatus" AS ENUM ('offered', 'accepted', 'declined', 'expired');

-- CreateEnum
CREATE TYPE "AdmissionConfirmationStatus" AS ENUM ('confirmed', 'cancelled');

-- CreateEnum
CREATE TYPE "AdmissionStudentLinkStatus" AS ENUM ('pending', 'linked');

-- CreateEnum
CREATE TYPE "AdmissionNotificationChannel" AS ENUM ('email', 'sms');

-- CreateEnum
CREATE TYPE "AdmissionNotificationStatus" AS ENUM ('queued', 'sent', 'failed');

-- CreateTable
CREATE TABLE "admission_academic_sessions" (
    "session_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "AdmissionSessionStatus" NOT NULL DEFAULT 'upcoming',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admission_academic_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "admission_programs" (
    "program_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "total_seats" INTEGER NOT NULL DEFAULT 0,
    "eligibility_criteria" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admission_programs_pkey" PRIMARY KEY ("program_id")
);

-- CreateTable
CREATE TABLE "admission_applicants" (
    "applicant_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dob" DATE,
    "gender" "AdmissionGender",
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "guardian_name" TEXT,
    "guardian_contact" TEXT,
    "photo_url" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admission_applicants_pkey" PRIMARY KEY ("applicant_id")
);

-- CreateTable
CREATE TABLE "admission_enquiries" (
    "enquiry_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "program_id" INTEGER,
    "source" "AdmissionEnquirySource" NOT NULL,
    "status" "AdmissionEnquiryStatus" NOT NULL DEFAULT 'new',
    "assigned_to" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admission_enquiries_pkey" PRIMARY KEY ("enquiry_id")
);

-- CreateTable
CREATE TABLE "admission_enquiry_followups" (
    "followup_id" SERIAL NOT NULL,
    "enquiry_id" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,
    "followup_date" DATE NOT NULL,
    "next_followup_date" DATE,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_enquiry_followups_pkey" PRIMARY KEY ("followup_id")
);

-- CreateTable
CREATE TABLE "admission_applications" (
    "application_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "applicant_id" INTEGER NOT NULL,
    "session_id" INTEGER NOT NULL,
    "program_id" INTEGER NOT NULL,
    "application_number" TEXT NOT NULL,
    "source_enquiry_id" INTEGER,
    "application_date" DATE NOT NULL,
    "status" "AdmissionApplicationStatus" NOT NULL DEFAULT 'draft',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admission_applications_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "admission_application_documents" (
    "document_id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "document_type" "AdmissionDocumentType" NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "verification_status" "AdmissionVerificationStatus" NOT NULL DEFAULT 'pending',
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "uploaded_by" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_application_documents_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "admission_application_fee_payments" (
    "payment_id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_mode" "AdmissionPaymentMode" NOT NULL,
    "transaction_ref" TEXT,
    "status" "AdmissionFeePaymentStatus" NOT NULL,
    "idempotency_key" TEXT,
    "recorded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_application_fee_payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "admission_entrance_tests" (
    "test_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "session_id" INTEGER NOT NULL,
    "program_id" INTEGER NOT NULL,
    "test_date" TIMESTAMP(3) NOT NULL,
    "mode" "AdmissionTestMode" NOT NULL,
    "venue" TEXT,
    "max_marks" DECIMAL(7,2) NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admission_entrance_tests_pkey" PRIMARY KEY ("test_id")
);

-- CreateTable
CREATE TABLE "admission_test_registrations" (
    "registration_id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "test_id" INTEGER NOT NULL,
    "hall_ticket_number" TEXT NOT NULL,
    "status" "AdmissionTestRegistrationStatus" NOT NULL DEFAULT 'registered',
    "registered_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_test_registrations_pkey" PRIMARY KEY ("registration_id")
);

-- CreateTable
CREATE TABLE "admission_test_results" (
    "result_id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "test_id" INTEGER NOT NULL,
    "marks_obtained" DECIMAL(7,2) NOT NULL,
    "rank" INTEGER,
    "recorded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_test_results_pkey" PRIMARY KEY ("result_id")
);

-- CreateTable
CREATE TABLE "admission_interviews" (
    "interview_id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "scheduled_datetime" TIMESTAMP(3) NOT NULL,
    "mode" "AdmissionInterviewMode" NOT NULL,
    "venue_or_link" TEXT,
    "status" "AdmissionInterviewStatus" NOT NULL DEFAULT 'scheduled',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_interviews_pkey" PRIMARY KEY ("interview_id")
);

-- CreateTable
CREATE TABLE "admission_interview_panelists" (
    "panelist_id" SERIAL NOT NULL,
    "interview_id" INTEGER NOT NULL,
    "evaluator_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_interview_panelists_pkey" PRIMARY KEY ("panelist_id")
);

-- CreateTable
CREATE TABLE "admission_interview_evaluations" (
    "evaluation_id" SERIAL NOT NULL,
    "interview_id" INTEGER NOT NULL,
    "evaluator_id" TEXT NOT NULL,
    "evaluator_name" TEXT,
    "score" DECIMAL(5,2) NOT NULL,
    "remarks" TEXT,
    "recommendation" "AdmissionRecommendation" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_interview_evaluations_pkey" PRIMARY KEY ("evaluation_id")
);

-- CreateTable
CREATE TABLE "admission_merit_lists" (
    "merit_list_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT,
    "session_id" INTEGER NOT NULL,
    "program_id" INTEGER NOT NULL,
    "criteria_description" TEXT NOT NULL,
    "published_date" TIMESTAMP(3),
    "published_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admission_merit_lists_pkey" PRIMARY KEY ("merit_list_id")
);

-- CreateTable
CREATE TABLE "admission_merit_list_entries" (
    "entry_id" SERIAL NOT NULL,
    "merit_list_id" INTEGER NOT NULL,
    "application_id" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "outcome" "AdmissionMeritOutcome" NOT NULL,

    CONSTRAINT "admission_merit_list_entries_pkey" PRIMARY KEY ("entry_id")
);

-- CreateTable
CREATE TABLE "admission_offers" (
    "offer_id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "offer_date" TIMESTAMP(3) NOT NULL,
    "offer_expiry_date" TIMESTAMP(3) NOT NULL,
    "status" "AdmissionOfferStatus" NOT NULL DEFAULT 'offered',
    "seat_category" TEXT NOT NULL,
    "issued_by" TEXT,
    "responded_by" TEXT,
    "responded_at" TIMESTAMP(3),
    "response_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_offers_pkey" PRIMARY KEY ("offer_id")
);

-- CreateTable
CREATE TABLE "admission_fee_structures" (
    "fee_structure_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "program_id" INTEGER NOT NULL,
    "session_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_fee_structures_pkey" PRIMARY KEY ("fee_structure_id")
);

-- CreateTable
CREATE TABLE "admission_payments" (
    "payment_id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_mode" "AdmissionPaymentMode" NOT NULL,
    "transaction_ref" TEXT,
    "receipt_number" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "recorded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "admission_confirmations" (
    "confirmation_id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "confirmed_date" TIMESTAMP(3) NOT NULL,
    "enrollment_number" TEXT NOT NULL,
    "status" "AdmissionConfirmationStatus" NOT NULL DEFAULT 'confirmed',
    "confirmed_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "cancellation_reason" TEXT,
    "student_ref" TEXT,
    "student_link_status" "AdmissionStudentLinkStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_confirmations_pkey" PRIMARY KEY ("confirmation_id")
);

-- CreateTable
CREATE TABLE "admission_notifications" (
    "notification_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "channel" "AdmissionNotificationChannel" NOT NULL DEFAULT 'email',
    "recipient" TEXT,
    "message" TEXT,
    "status" "AdmissionNotificationStatus" NOT NULL DEFAULT 'queued',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "admission_dynamic_roles" (
    "role_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_dynamic_roles_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "admission_user_dynamic_roles" (
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

    CONSTRAINT "admission_user_dynamic_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_sso_sessions" (
    "session_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "eddva_user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT,
    "user_role" TEXT NOT NULL,
    "admission_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_sso_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "admission_permissions_catalog" (
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

    CONSTRAINT "admission_permissions_catalog_pkey" PRIMARY KEY ("permission_id")
);

-- CreateTable
CREATE TABLE "admission_number_sequences" (
    "id" SERIAL NOT NULL,
    "sequence_type" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "current_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "admission_number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admission_academic_sessions_institute_id_status_idx" ON "admission_academic_sessions"("institute_id", "status");

-- CreateIndex
CREATE INDEX "admission_academic_sessions_institute_id_name_idx" ON "admission_academic_sessions"("institute_id", "name");

-- CreateIndex
CREATE INDEX "admission_programs_institute_id_name_idx" ON "admission_programs"("institute_id", "name");

-- CreateIndex
CREATE INDEX "admission_applicants_institute_id_phone_idx" ON "admission_applicants"("institute_id", "phone");

-- CreateIndex
CREATE INDEX "admission_applicants_institute_id_email_idx" ON "admission_applicants"("institute_id", "email");

-- CreateIndex
CREATE INDEX "admission_applicants_institute_id_name_idx" ON "admission_applicants"("institute_id", "name");

-- CreateIndex
CREATE INDEX "admission_enquiries_institute_id_status_idx" ON "admission_enquiries"("institute_id", "status");

-- CreateIndex
CREATE INDEX "admission_enquiries_institute_id_assigned_to_status_idx" ON "admission_enquiries"("institute_id", "assigned_to", "status");

-- CreateIndex
CREATE INDEX "admission_enquiries_institute_id_program_id_idx" ON "admission_enquiries"("institute_id", "program_id");

-- CreateIndex
CREATE INDEX "admission_enquiries_institute_id_created_at_idx" ON "admission_enquiries"("institute_id", "created_at");

-- CreateIndex
CREATE INDEX "admission_enquiry_followups_enquiry_id_followup_date_idx" ON "admission_enquiry_followups"("enquiry_id", "followup_date");

-- CreateIndex
CREATE INDEX "admission_enquiry_followups_next_followup_date_idx" ON "admission_enquiry_followups"("next_followup_date");

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_application_number_key" ON "admission_applications"("application_number");

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_source_enquiry_id_key" ON "admission_applications"("source_enquiry_id");

-- CreateIndex
CREATE INDEX "admission_applications_institute_id_session_id_program_id_s_idx" ON "admission_applications"("institute_id", "session_id", "program_id", "status");

-- CreateIndex
CREATE INDEX "admission_applications_institute_id_status_idx" ON "admission_applications"("institute_id", "status");

-- CreateIndex
CREATE INDEX "admission_applications_institute_id_application_date_idx" ON "admission_applications"("institute_id", "application_date");

-- CreateIndex
CREATE INDEX "admission_applications_applicant_id_idx" ON "admission_applications"("applicant_id");

-- CreateIndex
CREATE INDEX "admission_application_documents_application_id_document_typ_idx" ON "admission_application_documents"("application_id", "document_type");

-- CreateIndex
CREATE INDEX "admission_application_documents_verification_status_idx" ON "admission_application_documents"("verification_status");

-- CreateIndex
CREATE INDEX "admission_application_fee_payments_application_id_status_idx" ON "admission_application_fee_payments"("application_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "admission_application_fee_payments_application_id_idempoten_key" ON "admission_application_fee_payments"("application_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "admission_entrance_tests_institute_id_session_id_program_id_idx" ON "admission_entrance_tests"("institute_id", "session_id", "program_id");

-- CreateIndex
CREATE INDEX "admission_entrance_tests_institute_id_test_date_idx" ON "admission_entrance_tests"("institute_id", "test_date");

-- CreateIndex
CREATE UNIQUE INDEX "admission_test_registrations_hall_ticket_number_key" ON "admission_test_registrations"("hall_ticket_number");

-- CreateIndex
CREATE INDEX "admission_test_registrations_test_id_status_idx" ON "admission_test_registrations"("test_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "admission_test_registrations_application_id_test_id_key" ON "admission_test_registrations"("application_id", "test_id");

-- CreateIndex
CREATE INDEX "admission_test_results_test_id_rank_idx" ON "admission_test_results"("test_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "admission_test_results_application_id_test_id_key" ON "admission_test_results"("application_id", "test_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_interviews_application_id_key" ON "admission_interviews"("application_id");

-- CreateIndex
CREATE INDEX "admission_interviews_status_scheduled_datetime_idx" ON "admission_interviews"("status", "scheduled_datetime");

-- CreateIndex
CREATE INDEX "admission_interview_panelists_evaluator_id_idx" ON "admission_interview_panelists"("evaluator_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_interview_panelists_interview_id_evaluator_id_key" ON "admission_interview_panelists"("interview_id", "evaluator_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_interview_evaluations_interview_id_evaluator_id_key" ON "admission_interview_evaluations"("interview_id", "evaluator_id");

-- CreateIndex
CREATE INDEX "admission_merit_lists_institute_id_session_id_program_id_idx" ON "admission_merit_lists"("institute_id", "session_id", "program_id");

-- CreateIndex
CREATE INDEX "admission_merit_list_entries_application_id_idx" ON "admission_merit_list_entries"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_merit_list_entries_merit_list_id_application_id_key" ON "admission_merit_list_entries"("merit_list_id", "application_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_merit_list_entries_merit_list_id_rank_key" ON "admission_merit_list_entries"("merit_list_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "admission_offers_application_id_key" ON "admission_offers"("application_id");

-- CreateIndex
CREATE INDEX "admission_offers_status_offer_expiry_date_idx" ON "admission_offers"("status", "offer_expiry_date");

-- CreateIndex
CREATE INDEX "admission_fee_structures_institute_id_idx" ON "admission_fee_structures"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_fee_structures_program_id_session_id_key" ON "admission_fee_structures"("program_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_payments_receipt_number_key" ON "admission_payments"("receipt_number");

-- CreateIndex
CREATE INDEX "admission_payments_application_id_idx" ON "admission_payments"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_payments_application_id_idempotency_key_key" ON "admission_payments"("application_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "admission_confirmations_application_id_key" ON "admission_confirmations"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_confirmations_enrollment_number_key" ON "admission_confirmations"("enrollment_number");

-- CreateIndex
CREATE INDEX "admission_confirmations_status_student_link_status_idx" ON "admission_confirmations"("status", "student_link_status");

-- CreateIndex
CREATE INDEX "admission_notifications_institute_id_event_type_idx" ON "admission_notifications"("institute_id", "event_type");

-- CreateIndex
CREATE INDEX "admission_notifications_entity_type_entity_id_idx" ON "admission_notifications"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_dynamic_roles_institute_id_name_key" ON "admission_dynamic_roles"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "admission_user_dynamic_roles_institute_id_eddva_user_id_key" ON "admission_user_dynamic_roles"("institute_id", "eddva_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_user_dynamic_roles_institute_id_username_key" ON "admission_user_dynamic_roles"("institute_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "admission_sso_sessions_admission_token_key" ON "admission_sso_sessions"("admission_token");

-- CreateIndex
CREATE UNIQUE INDEX "admission_permissions_catalog_key_key" ON "admission_permissions_catalog"("key");

-- CreateIndex
CREATE UNIQUE INDEX "admission_number_sequences_sequence_type_financial_year_key" ON "admission_number_sequences"("sequence_type", "financial_year");

-- AddForeignKey
ALTER TABLE "admission_enquiries" ADD CONSTRAINT "admission_enquiries_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "admission_programs"("program_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_enquiry_followups" ADD CONSTRAINT "admission_enquiry_followups_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "admission_enquiries"("enquiry_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "admission_applicants"("applicant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "admission_academic_sessions"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "admission_programs"("program_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_source_enquiry_id_fkey" FOREIGN KEY ("source_enquiry_id") REFERENCES "admission_enquiries"("enquiry_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_application_documents" ADD CONSTRAINT "admission_application_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "admission_applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_application_fee_payments" ADD CONSTRAINT "admission_application_fee_payments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "admission_applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_entrance_tests" ADD CONSTRAINT "admission_entrance_tests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "admission_academic_sessions"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_entrance_tests" ADD CONSTRAINT "admission_entrance_tests_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "admission_programs"("program_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_test_registrations" ADD CONSTRAINT "admission_test_registrations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "admission_applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_test_registrations" ADD CONSTRAINT "admission_test_registrations_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "admission_entrance_tests"("test_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_test_results" ADD CONSTRAINT "admission_test_results_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "admission_applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_test_results" ADD CONSTRAINT "admission_test_results_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "admission_entrance_tests"("test_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_interviews" ADD CONSTRAINT "admission_interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "admission_applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_interview_panelists" ADD CONSTRAINT "admission_interview_panelists_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "admission_interviews"("interview_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_interview_evaluations" ADD CONSTRAINT "admission_interview_evaluations_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "admission_interviews"("interview_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_merit_lists" ADD CONSTRAINT "admission_merit_lists_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "admission_academic_sessions"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_merit_lists" ADD CONSTRAINT "admission_merit_lists_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "admission_programs"("program_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_merit_list_entries" ADD CONSTRAINT "admission_merit_list_entries_merit_list_id_fkey" FOREIGN KEY ("merit_list_id") REFERENCES "admission_merit_lists"("merit_list_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_merit_list_entries" ADD CONSTRAINT "admission_merit_list_entries_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "admission_applications"("application_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_offers" ADD CONSTRAINT "admission_offers_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "admission_applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_fee_structures" ADD CONSTRAINT "admission_fee_structures_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "admission_programs"("program_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_fee_structures" ADD CONSTRAINT "admission_fee_structures_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "admission_academic_sessions"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_payments" ADD CONSTRAINT "admission_payments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "admission_applications"("application_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_confirmations" ADD CONSTRAINT "admission_confirmations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "admission_applications"("application_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_user_dynamic_roles" ADD CONSTRAINT "admission_user_dynamic_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admission_dynamic_roles"("role_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One live (non-deleted, non-terminal) application per applicant per program/session.
-- Partial index — not expressible in schema.prisma; the service also pre-checks for a friendly 409.
CREATE UNIQUE INDEX "admission_applications_live_applicant_session_program_key"
    ON "admission_applications" ("applicant_id", "session_id", "program_id")
    WHERE "deleted_at" IS NULL AND "status" NOT IN ('rejected', 'cancelled');

-- Domain CHECK constraints (defence in depth behind DTO/service validation)
ALTER TABLE "admission_programs" ADD CONSTRAINT "admission_programs_total_seats_check" CHECK ("total_seats" >= 0);
ALTER TABLE "admission_academic_sessions" ADD CONSTRAINT "admission_academic_sessions_dates_check" CHECK ("end_date" >= "start_date");
ALTER TABLE "admission_application_fee_payments" ADD CONSTRAINT "admission_application_fee_payments_amount_check" CHECK ("amount" > 0);
ALTER TABLE "admission_entrance_tests" ADD CONSTRAINT "admission_entrance_tests_max_marks_check" CHECK ("max_marks" > 0);
ALTER TABLE "admission_test_results" ADD CONSTRAINT "admission_test_results_marks_check" CHECK ("marks_obtained" >= 0);
ALTER TABLE "admission_interview_evaluations" ADD CONSTRAINT "admission_interview_evaluations_score_check" CHECK ("score" >= 0 AND "score" <= 100);
ALTER TABLE "admission_merit_list_entries" ADD CONSTRAINT "admission_merit_list_entries_rank_check" CHECK ("rank" >= 1);
ALTER TABLE "admission_offers" ADD CONSTRAINT "admission_offers_expiry_check" CHECK ("offer_expiry_date" > "offer_date");
ALTER TABLE "admission_fee_structures" ADD CONSTRAINT "admission_fee_structures_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "admission_payments" ADD CONSTRAINT "admission_payments_amount_check" CHECK ("amount_paid" > 0);
