-- CreateEnum
CREATE TYPE "AlumniVerificationStatus" AS ENUM ('pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "AlumniVisibility" AS ENUM ('public', 'alumni_only', 'private');

-- CreateEnum
CREATE TYPE "AlumniSource" AS ENUM ('staff_created', 'self_registered');

-- CreateEnum
CREATE TYPE "AlumniGroupType" AS ENUM ('batch', 'program', 'location', 'interest');

-- CreateEnum
CREATE TYPE "AlumniEventType" AS ENUM ('reunion', 'webinar', 'networking', 'fundraiser');

-- CreateEnum
CREATE TYPE "AlumniEventMode" AS ENUM ('online', 'offline', 'hybrid');

-- CreateEnum
CREATE TYPE "AlumniEventStatus" AS ENUM ('upcoming', 'ongoing', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "AlumniAttendanceStatus" AS ENUM ('registered', 'attended', 'no_show', 'cancelled');

-- CreateEnum
CREATE TYPE "AlumniEventPaymentStatus" AS ENUM ('not_applicable', 'pending', 'paid');

-- CreateEnum
CREATE TYPE "AlumniEventPaymentMode" AS ENUM ('card', 'upi', 'bank_transfer');

-- CreateEnum
CREATE TYPE "AlumniJobType" AS ENUM ('full_time', 'part_time', 'internship', 'contract');

-- CreateEnum
CREATE TYPE "AlumniJobStatus" AS ENUM ('open', 'closed', 'expired');

-- CreateEnum
CREATE TYPE "AlumniApplicationStatus" AS ENUM ('applied', 'shortlisted', 'rejected', 'hired', 'withdrawn');

-- CreateEnum
CREATE TYPE "AlumniProgramStatus" AS ENUM ('open_for_signup', 'active', 'completed');

-- CreateEnum
CREATE TYPE "AlumniMentorStatus" AS ENUM ('available', 'fully_booked', 'inactive');

-- CreateEnum
CREATE TYPE "AlumniMatchStatus" AS ENUM ('active', 'completed', 'discontinued');

-- CreateEnum
CREATE TYPE "AlumniCampaignStatus" AS ENUM ('active', 'completed', 'closed');

-- CreateEnum
CREATE TYPE "AlumniDonationStatus" AS ENUM ('pending', 'received', 'failed', 'cancelled', 'reversed');

-- CreateEnum
CREATE TYPE "AlumniDonationPaymentMode" AS ENUM ('card', 'upi', 'bank_transfer', 'cheque');

-- CreateEnum
CREATE TYPE "AlumniNewsletterStatus" AS ENUM ('draft', 'sent');

-- CreateEnum
CREATE TYPE "AlumniCommChannel" AS ENUM ('email', 'sms');

-- CreateEnum
CREATE TYPE "AlumniCommStatus" AS ENUM ('queued', 'sent', 'opened', 'clicked', 'failed');

-- CreateEnum
CREATE TYPE "AlumniNotificationChannel" AS ENUM ('email', 'sms', 'in_app');

-- CreateEnum
CREATE TYPE "AlumniNotificationAudience" AS ENUM ('alumni', 'staff');

-- CreateEnum
CREATE TYPE "AlumniNotificationStatus" AS ENUM ('queued', 'sent', 'failed');

-- CreateTable
CREATE TABLE "alumni_profiles" (
    "alumni_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "student_ref" TEXT,
    "admission_no" TEXT,
    "full_name" TEXT NOT NULL,
    "batch_year" INTEGER NOT NULL,
    "graduation_year" INTEGER,
    "program" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "current_company" TEXT,
    "current_designation" TEXT,
    "industry" TEXT,
    "city" TEXT,
    "country" TEXT,
    "linkedin_url" TEXT,
    "photo_path" TEXT,
    "photo_mime" TEXT,
    "verification_status" "AlumniVerificationStatus" NOT NULL DEFAULT 'pending',
    "verification_note" TEXT,
    "verification_requested_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "rejection_reason" TEXT,
    "visibility" "AlumniVisibility" NOT NULL DEFAULT 'alumni_only',
    "contact_visible" BOOLEAN NOT NULL DEFAULT false,
    "email_opt_in" BOOLEAN NOT NULL DEFAULT true,
    "sms_opt_in" BOOLEAN NOT NULL DEFAULT true,
    "source" "AlumniSource" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_profiles_pkey" PRIMARY KEY ("alumni_id")
);

-- CreateTable
CREATE TABLE "alumni_employments" (
    "employment_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "alumni_id" INTEGER NOT NULL,
    "company" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "industry" TEXT,
    "location" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_employments_pkey" PRIMARY KEY ("employment_id")
);

-- CreateTable
CREATE TABLE "alumni_groups" (
    "group_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group_type" "AlumniGroupType" NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_groups_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable
CREATE TABLE "alumni_group_members" (
    "member_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "group_id" INTEGER NOT NULL,
    "alumni_id" INTEGER NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_by" TEXT,

    CONSTRAINT "alumni_group_members_pkey" PRIMARY KEY ("member_id")
);

-- CreateTable
CREATE TABLE "alumni_events" (
    "event_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "event_type" "AlumniEventType" NOT NULL,
    "mode" "AlumniEventMode" NOT NULL,
    "venue" TEXT,
    "online_link" TEXT,
    "event_date" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "registration_deadline" TIMESTAMP(3),
    "max_capacity" INTEGER,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "ticket_price" DECIMAL(10,2),
    "status" "AlumniEventStatus" NOT NULL DEFAULT 'upcoming',
    "banner_path" TEXT,
    "banner_mime" TEXT,
    "cancel_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "alumni_event_registrations" (
    "registration_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "event_id" INTEGER NOT NULL,
    "alumni_id" INTEGER NOT NULL,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attendance_status" "AlumniAttendanceStatus" NOT NULL DEFAULT 'registered',
    "payment_status" "AlumniEventPaymentStatus" NOT NULL DEFAULT 'not_applicable',
    "amount_due" DECIMAL(10,2),
    "cancelled_at" TIMESTAMP(3),
    "attendance_marked_at" TIMESTAMP(3),
    "attendance_marked_by" TEXT,
    "reminder_queued_at" TIMESTAMP(3),
    "registered_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_event_registrations_pkey" PRIMARY KEY ("registration_id")
);

-- CreateTable
CREATE TABLE "alumni_event_payments" (
    "payment_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "registration_id" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_mode" "AlumniEventPaymentMode" NOT NULL,
    "transaction_ref" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "recorded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alumni_event_payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "alumni_jobs" (
    "job_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "posted_by_alumni_id" INTEGER,
    "posted_by_user_id" TEXT,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "job_type" "AlumniJobType" NOT NULL,
    "industry" TEXT,
    "posted_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiry_date" TIMESTAMP(3),
    "status" "AlumniJobStatus" NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_jobs_pkey" PRIMARY KEY ("job_id")
);

-- CreateTable
CREATE TABLE "alumni_job_applications" (
    "application_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "job_id" INTEGER NOT NULL,
    "applicant_alumni_id" INTEGER NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AlumniApplicationStatus" NOT NULL DEFAULT 'applied',
    "resume_url" TEXT,
    "resume_path" TEXT,
    "resume_mime" TEXT,
    "cover_note" TEXT,
    "status_note" TEXT,
    "status_updated_at" TIMESTAMP(3),
    "status_updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_job_applications_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "alumni_mentorship_programs" (
    "program_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "AlumniProgramStatus" NOT NULL DEFAULT 'open_for_signup',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_mentorship_programs_pkey" PRIMARY KEY ("program_id")
);

-- CreateTable
CREATE TABLE "alumni_mentor_profiles" (
    "mentor_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "alumni_id" INTEGER NOT NULL,
    "expertise_areas" TEXT[],
    "max_mentees" INTEGER NOT NULL DEFAULT 3,
    "status" "AlumniMentorStatus" NOT NULL DEFAULT 'available',
    "bio" TEXT,
    "availability_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_mentor_profiles_pkey" PRIMARY KEY ("mentor_id")
);

-- CreateTable
CREATE TABLE "alumni_mentorship_matches" (
    "match_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "program_id" INTEGER NOT NULL,
    "mentor_id" INTEGER NOT NULL,
    "mentee_alumni_id" INTEGER,
    "mentee_student_ref" TEXT,
    "mentee_name" TEXT,
    "matched_date" DATE NOT NULL,
    "status" "AlumniMatchStatus" NOT NULL DEFAULT 'active',
    "ended_at" TIMESTAMP(3),
    "end_reason" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_mentorship_matches_pkey" PRIMARY KEY ("match_id")
);

-- CreateTable
CREATE TABLE "alumni_campaigns" (
    "campaign_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "goal_amount" DECIMAL(14,2) NOT NULL,
    "raised_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "AlumniCampaignStatus" NOT NULL DEFAULT 'active',
    "closed_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_campaigns_pkey" PRIMARY KEY ("campaign_id")
);

-- CreateTable
CREATE TABLE "alumni_donations" (
    "donation_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "alumni_id" INTEGER NOT NULL,
    "campaign_id" INTEGER,
    "amount" DECIMAL(12,2) NOT NULL,
    "donation_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_mode" "AlumniDonationPaymentMode" NOT NULL,
    "transaction_ref" TEXT,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" "AlumniDonationStatus" NOT NULL DEFAULT 'pending',
    "receipt_number" TEXT,
    "receipt_issued_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "received_by" TEXT,
    "notes" TEXT,
    "status_reason" TEXT,
    "reversed_at" TIMESTAMP(3),
    "reversed_by" TEXT,
    "recorded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_donations_pkey" PRIMARY KEY ("donation_id")
);

-- CreateTable
CREATE TABLE "alumni_newsletters" (
    "newsletter_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "target_segment" JSONB NOT NULL,
    "status" "AlumniNewsletterStatus" NOT NULL DEFAULT 'draft',
    "sent_at" TIMESTAMP(3),
    "sent_by" TEXT,
    "recipient_count" INTEGER,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_newsletters_pkey" PRIMARY KEY ("newsletter_id")
);

-- CreateTable
CREATE TABLE "alumni_communication_logs" (
    "log_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "newsletter_id" INTEGER NOT NULL,
    "alumni_id" INTEGER NOT NULL,
    "channel" "AlumniCommChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "AlumniCommStatus" NOT NULL DEFAULT 'queued',
    "sent_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_communication_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "alumni_notifications" (
    "notification_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "alumni_id" INTEGER,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "audience" "AlumniNotificationAudience" NOT NULL,
    "channel" "AlumniNotificationChannel" NOT NULL DEFAULT 'in_app',
    "recipient" TEXT,
    "message" TEXT,
    "status" "AlumniNotificationStatus" NOT NULL DEFAULT 'queued',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alumni_notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "alumni_dynamic_roles" (
    "role_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_dynamic_roles_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "alumni_user_dynamic_roles" (
    "id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "eddva_user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "role_id" INTEGER NOT NULL,
    "alumni_id" INTEGER,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alumni_user_dynamic_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumni_sso_sessions" (
    "session_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "eddva_user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT,
    "user_role" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alumni_sso_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "alumni_permissions_catalog" (
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

    CONSTRAINT "alumni_permissions_catalog_pkey" PRIMARY KEY ("permission_id")
);

-- CreateTable
CREATE TABLE "alumni_number_sequences" (
    "id" SERIAL NOT NULL,
    "sequence_type" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "current_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "alumni_number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alumni_profiles_institute_id_batch_year_idx" ON "alumni_profiles"("institute_id", "batch_year");

-- CreateIndex
CREATE INDEX "alumni_profiles_institute_id_program_idx" ON "alumni_profiles"("institute_id", "program");

-- CreateIndex
CREATE INDEX "alumni_profiles_institute_id_current_company_idx" ON "alumni_profiles"("institute_id", "current_company");

-- CreateIndex
CREATE INDEX "alumni_profiles_institute_id_industry_idx" ON "alumni_profiles"("institute_id", "industry");

-- CreateIndex
CREATE INDEX "alumni_profiles_institute_id_city_idx" ON "alumni_profiles"("institute_id", "city");

-- CreateIndex
CREATE INDEX "alumni_profiles_institute_id_country_idx" ON "alumni_profiles"("institute_id", "country");

-- CreateIndex
CREATE INDEX "alumni_profiles_institute_id_verification_status_idx" ON "alumni_profiles"("institute_id", "verification_status");

-- CreateIndex
CREATE INDEX "alumni_profiles_institute_id_full_name_idx" ON "alumni_profiles"("institute_id", "full_name");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_profiles_institute_id_email_key" ON "alumni_profiles"("institute_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_profiles_institute_id_student_ref_key" ON "alumni_profiles"("institute_id", "student_ref");

-- CreateIndex
CREATE INDEX "alumni_employments_alumni_id_is_active_idx" ON "alumni_employments"("alumni_id", "is_active");

-- CreateIndex
CREATE INDEX "alumni_employments_institute_id_company_idx" ON "alumni_employments"("institute_id", "company");

-- CreateIndex
CREATE INDEX "alumni_groups_institute_id_group_type_idx" ON "alumni_groups"("institute_id", "group_type");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_groups_institute_id_group_type_name_key" ON "alumni_groups"("institute_id", "group_type", "name");

-- CreateIndex
CREATE INDEX "alumni_group_members_alumni_id_idx" ON "alumni_group_members"("alumni_id");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_group_members_group_id_alumni_id_key" ON "alumni_group_members"("group_id", "alumni_id");

-- CreateIndex
CREATE INDEX "alumni_events_institute_id_status_event_date_idx" ON "alumni_events"("institute_id", "status", "event_date");

-- CreateIndex
CREATE INDEX "alumni_events_institute_id_event_date_idx" ON "alumni_events"("institute_id", "event_date");

-- CreateIndex
CREATE INDEX "alumni_events_registration_deadline_idx" ON "alumni_events"("registration_deadline");

-- CreateIndex
CREATE INDEX "alumni_event_registrations_event_id_attendance_status_idx" ON "alumni_event_registrations"("event_id", "attendance_status");

-- CreateIndex
CREATE INDEX "alumni_event_registrations_alumni_id_idx" ON "alumni_event_registrations"("alumni_id");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_event_registrations_event_id_alumni_id_key" ON "alumni_event_registrations"("event_id", "alumni_id");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_event_payments_registration_id_key" ON "alumni_event_payments"("registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_event_payments_institute_id_transaction_ref_key" ON "alumni_event_payments"("institute_id", "transaction_ref");

-- CreateIndex
CREATE INDEX "alumni_jobs_institute_id_status_expiry_date_idx" ON "alumni_jobs"("institute_id", "status", "expiry_date");

-- CreateIndex
CREATE INDEX "alumni_jobs_posted_by_alumni_id_idx" ON "alumni_jobs"("posted_by_alumni_id");

-- CreateIndex
CREATE INDEX "alumni_jobs_institute_id_job_type_idx" ON "alumni_jobs"("institute_id", "job_type");

-- CreateIndex
CREATE INDEX "alumni_jobs_institute_id_company_idx" ON "alumni_jobs"("institute_id", "company");

-- CreateIndex
CREATE INDEX "alumni_job_applications_job_id_status_idx" ON "alumni_job_applications"("job_id", "status");

-- CreateIndex
CREATE INDEX "alumni_job_applications_applicant_alumni_id_idx" ON "alumni_job_applications"("applicant_alumni_id");

-- CreateIndex
CREATE INDEX "alumni_job_applications_institute_id_status_idx" ON "alumni_job_applications"("institute_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_job_applications_job_id_applicant_alumni_id_key" ON "alumni_job_applications"("job_id", "applicant_alumni_id");

-- CreateIndex
CREATE INDEX "alumni_mentorship_programs_institute_id_status_idx" ON "alumni_mentorship_programs"("institute_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_mentorship_programs_institute_id_name_key" ON "alumni_mentorship_programs"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_mentor_profiles_alumni_id_key" ON "alumni_mentor_profiles"("alumni_id");

-- CreateIndex
CREATE INDEX "alumni_mentor_profiles_institute_id_status_idx" ON "alumni_mentor_profiles"("institute_id", "status");

-- CreateIndex
CREATE INDEX "alumni_mentorship_matches_mentor_id_status_idx" ON "alumni_mentorship_matches"("mentor_id", "status");

-- CreateIndex
CREATE INDEX "alumni_mentorship_matches_institute_id_program_id_status_idx" ON "alumni_mentorship_matches"("institute_id", "program_id", "status");

-- CreateIndex
CREATE INDEX "alumni_mentorship_matches_mentee_alumni_id_idx" ON "alumni_mentorship_matches"("mentee_alumni_id");

-- CreateIndex
CREATE INDEX "alumni_campaigns_institute_id_status_idx" ON "alumni_campaigns"("institute_id", "status");

-- CreateIndex
CREATE INDEX "alumni_campaigns_institute_id_start_date_end_date_idx" ON "alumni_campaigns"("institute_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "alumni_donations_institute_id_campaign_id_status_idx" ON "alumni_donations"("institute_id", "campaign_id", "status");

-- CreateIndex
CREATE INDEX "alumni_donations_alumni_id_status_idx" ON "alumni_donations"("alumni_id", "status");

-- CreateIndex
CREATE INDEX "alumni_donations_institute_id_donation_date_idx" ON "alumni_donations"("institute_id", "donation_date");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_donations_institute_id_receipt_number_key" ON "alumni_donations"("institute_id", "receipt_number");

-- CreateIndex
CREATE INDEX "alumni_newsletters_institute_id_status_idx" ON "alumni_newsletters"("institute_id", "status");

-- CreateIndex
CREATE INDEX "alumni_communication_logs_newsletter_id_status_idx" ON "alumni_communication_logs"("newsletter_id", "status");

-- CreateIndex
CREATE INDEX "alumni_communication_logs_alumni_id_idx" ON "alumni_communication_logs"("alumni_id");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_communication_logs_newsletter_id_alumni_id_channel_key" ON "alumni_communication_logs"("newsletter_id", "alumni_id", "channel");

-- CreateIndex
CREATE INDEX "alumni_notifications_institute_id_event_type_idx" ON "alumni_notifications"("institute_id", "event_type");

-- CreateIndex
CREATE INDEX "alumni_notifications_entity_type_entity_id_idx" ON "alumni_notifications"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "alumni_notifications_alumni_id_created_at_idx" ON "alumni_notifications"("alumni_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_dynamic_roles_institute_id_name_key" ON "alumni_dynamic_roles"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_user_dynamic_roles_alumni_id_key" ON "alumni_user_dynamic_roles"("alumni_id");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_user_dynamic_roles_institute_id_eddva_user_id_key" ON "alumni_user_dynamic_roles"("institute_id", "eddva_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_user_dynamic_roles_institute_id_username_key" ON "alumni_user_dynamic_roles"("institute_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_sso_sessions_token_hash_key" ON "alumni_sso_sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_permissions_catalog_key_key" ON "alumni_permissions_catalog"("key");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_number_sequences_sequence_type_financial_year_key" ON "alumni_number_sequences"("sequence_type", "financial_year");

-- AddForeignKey
ALTER TABLE "alumni_employments" ADD CONSTRAINT "alumni_employments_alumni_id_fkey" FOREIGN KEY ("alumni_id") REFERENCES "alumni_profiles"("alumni_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_group_members" ADD CONSTRAINT "alumni_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "alumni_groups"("group_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_group_members" ADD CONSTRAINT "alumni_group_members_alumni_id_fkey" FOREIGN KEY ("alumni_id") REFERENCES "alumni_profiles"("alumni_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_event_registrations" ADD CONSTRAINT "alumni_event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "alumni_events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_event_registrations" ADD CONSTRAINT "alumni_event_registrations_alumni_id_fkey" FOREIGN KEY ("alumni_id") REFERENCES "alumni_profiles"("alumni_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_event_payments" ADD CONSTRAINT "alumni_event_payments_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "alumni_event_registrations"("registration_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_jobs" ADD CONSTRAINT "alumni_jobs_posted_by_alumni_id_fkey" FOREIGN KEY ("posted_by_alumni_id") REFERENCES "alumni_profiles"("alumni_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_job_applications" ADD CONSTRAINT "alumni_job_applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "alumni_jobs"("job_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_job_applications" ADD CONSTRAINT "alumni_job_applications_applicant_alumni_id_fkey" FOREIGN KEY ("applicant_alumni_id") REFERENCES "alumni_profiles"("alumni_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_mentor_profiles" ADD CONSTRAINT "alumni_mentor_profiles_alumni_id_fkey" FOREIGN KEY ("alumni_id") REFERENCES "alumni_profiles"("alumni_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_mentorship_matches" ADD CONSTRAINT "alumni_mentorship_matches_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "alumni_mentorship_programs"("program_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_mentorship_matches" ADD CONSTRAINT "alumni_mentorship_matches_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "alumni_mentor_profiles"("mentor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_mentorship_matches" ADD CONSTRAINT "alumni_mentorship_matches_mentee_alumni_id_fkey" FOREIGN KEY ("mentee_alumni_id") REFERENCES "alumni_profiles"("alumni_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_donations" ADD CONSTRAINT "alumni_donations_alumni_id_fkey" FOREIGN KEY ("alumni_id") REFERENCES "alumni_profiles"("alumni_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_donations" ADD CONSTRAINT "alumni_donations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "alumni_campaigns"("campaign_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_communication_logs" ADD CONSTRAINT "alumni_communication_logs_newsletter_id_fkey" FOREIGN KEY ("newsletter_id") REFERENCES "alumni_newsletters"("newsletter_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_communication_logs" ADD CONSTRAINT "alumni_communication_logs_alumni_id_fkey" FOREIGN KEY ("alumni_id") REFERENCES "alumni_profiles"("alumni_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_user_dynamic_roles" ADD CONSTRAINT "alumni_user_dynamic_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "alumni_dynamic_roles"("role_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_user_dynamic_roles" ADD CONSTRAINT "alumni_user_dynamic_roles_alumni_id_fkey" FOREIGN KEY ("alumni_id") REFERENCES "alumni_profiles"("alumni_id") ON DELETE RESTRICT ON UPDATE CASCADE;

