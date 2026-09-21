-- Integrity rules that Prisma cannot express (CHECK constraints, partial unique
-- indexes, GIN). They are the last line of defence behind the application-level
-- checks, so a racing request or a buggy caller still cannot break an invariant.

-- ─── Alumni directory ────────────────────────────────────────────────────────
ALTER TABLE "alumni_profiles"
    ADD CONSTRAINT "alumni_profiles_years_chk"
    CHECK ("batch_year" BETWEEN 1900 AND 2100
       AND ("graduation_year" IS NULL OR ("graduation_year" BETWEEN 1900 AND 2100 AND "graduation_year" >= "batch_year")));

ALTER TABLE "alumni_profiles"
    ADD CONSTRAINT "alumni_profiles_email_lower_chk" CHECK ("email" = lower("email"));

-- ─── Employment history ──────────────────────────────────────────────────────
ALTER TABLE "alumni_employments"
    ADD CONSTRAINT "alumni_employments_dates_chk"
    CHECK (("end_date" IS NULL OR "end_date" >= "start_date")
       AND (NOT "is_current" OR "end_date" IS NULL));

-- At most one live "current" position per alumnus.
CREATE UNIQUE INDEX "alumni_employments_one_current_key"
    ON "alumni_employments"("alumni_id") WHERE "is_current" AND "is_active";

-- ─── Events ──────────────────────────────────────────────────────────────────
ALTER TABLE "alumni_events"
    ADD CONSTRAINT "alumni_events_capacity_chk" CHECK ("max_capacity" IS NULL OR "max_capacity" > 0),
    ADD CONSTRAINT "alumni_events_price_chk"
        CHECK (("is_paid" AND "ticket_price" IS NOT NULL AND "ticket_price" > 0)
            OR (NOT "is_paid" AND "ticket_price" IS NULL)),
    ADD CONSTRAINT "alumni_events_dates_chk"
        CHECK (("registration_deadline" IS NULL OR "registration_deadline" <= "event_date")
           AND ("ends_at" IS NULL OR "ends_at" > "event_date"));

ALTER TABLE "alumni_event_registrations"
    ADD CONSTRAINT "alumni_event_registrations_amount_chk" CHECK ("amount_due" IS NULL OR "amount_due" > 0);

ALTER TABLE "alumni_event_payments"
    ADD CONSTRAINT "alumni_event_payments_amount_chk" CHECK ("amount" > 0);

-- ─── Jobs ────────────────────────────────────────────────────────────────────
ALTER TABLE "alumni_jobs"
    ADD CONSTRAINT "alumni_jobs_expiry_chk" CHECK ("expiry_date" IS NULL OR "expiry_date" > "posted_date"),
    ADD CONSTRAINT "alumni_jobs_poster_chk" CHECK ("posted_by_alumni_id" IS NOT NULL OR "posted_by_user_id" IS NOT NULL);

-- ─── Mentorship ──────────────────────────────────────────────────────────────
ALTER TABLE "alumni_mentorship_programs"
    ADD CONSTRAINT "alumni_mentorship_programs_dates_chk" CHECK ("end_date" >= "start_date");

ALTER TABLE "alumni_mentor_profiles"
    ADD CONSTRAINT "alumni_mentor_profiles_capacity_chk" CHECK ("max_mentees" BETWEEN 1 AND 50);

CREATE INDEX "alumni_mentor_profiles_expertise_gin_idx"
    ON "alumni_mentor_profiles" USING GIN ("expertise_areas");

-- A mentee is EITHER an alumnus OR a current student (external reference), never both / neither.
ALTER TABLE "alumni_mentorship_matches"
    ADD CONSTRAINT "alumni_mentorship_matches_mentee_chk"
    CHECK (("mentee_alumni_id" IS NOT NULL) <> ("mentee_student_ref" IS NOT NULL));

-- A mentee has at most one ACTIVE mentor per program.
CREATE UNIQUE INDEX "alumni_mentorship_matches_one_active_alumni_key"
    ON "alumni_mentorship_matches"("program_id", "mentee_alumni_id")
    WHERE "status" = 'active' AND "mentee_alumni_id" IS NOT NULL;

CREATE UNIQUE INDEX "alumni_mentorship_matches_one_active_student_key"
    ON "alumni_mentorship_matches"("program_id", "mentee_student_ref")
    WHERE "status" = 'active' AND "mentee_student_ref" IS NOT NULL;

-- ─── Fundraising ─────────────────────────────────────────────────────────────
ALTER TABLE "alumni_campaigns"
    ADD CONSTRAINT "alumni_campaigns_amounts_chk" CHECK ("goal_amount" > 0 AND "raised_amount" >= 0),
    ADD CONSTRAINT "alumni_campaigns_dates_chk" CHECK ("end_date" >= "start_date");

ALTER TABLE "alumni_donations"
    ADD CONSTRAINT "alumni_donations_amount_chk" CHECK ("amount" > 0),
    -- A received donation is always backed by a receipt number and a transaction reference.
    ADD CONSTRAINT "alumni_donations_received_chk"
        CHECK ("status" NOT IN ('received', 'reversed')
            OR ("receipt_number" IS NOT NULL AND "transaction_ref" IS NOT NULL AND "received_at" IS NOT NULL));

-- The same payment reference cannot back two live donations (double-recording guard).
CREATE UNIQUE INDEX "alumni_donations_live_transaction_ref_key"
    ON "alumni_donations"("institute_id", "payment_mode", "transaction_ref")
    WHERE "transaction_ref" IS NOT NULL AND "status" IN ('pending', 'received');

-- ─── Newsletters ─────────────────────────────────────────────────────────────
ALTER TABLE "alumni_newsletters"
    ADD CONSTRAINT "alumni_newsletters_sent_chk" CHECK ("status" = 'draft' OR "sent_at" IS NOT NULL);
