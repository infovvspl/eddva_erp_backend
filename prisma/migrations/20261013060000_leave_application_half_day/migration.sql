ALTER TABLE "staff_leave_applications" ADD COLUMN "is_half_day" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "staff_leave_applications" ADD COLUMN "half_day_period" VARCHAR(2);
