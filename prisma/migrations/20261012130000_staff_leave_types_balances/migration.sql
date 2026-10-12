CREATE TABLE "staff_leave_types" (
  "leave_type_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "applicable_staff_type" "StaffType",
  "annual_quota_days" DECIMAL(5,1) NOT NULL,
  "is_paid" BOOLEAN NOT NULL DEFAULT true,
  "allow_carry_forward" BOOLEAN NOT NULL DEFAULT false,
  "max_carry_forward_days" DECIMAL(5,1),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "staff_leave_types_institute_id_code_key" ON "staff_leave_types"("institute_id", "code");
CREATE INDEX "staff_leave_types_institute_id_idx" ON "staff_leave_types"("institute_id");

CREATE TABLE "staff_leave_balances" (
  "balance_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "staff_id" INTEGER NOT NULL,
  "leave_type_id" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "allocated_days" DECIMAL(5,1) NOT NULL,
  "used_days" DECIMAL(5,1) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_leave_balances_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("staff_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "staff_leave_balances_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "staff_leave_types"("leave_type_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "staff_leave_balances_staff_id_leave_type_id_year_key" ON "staff_leave_balances"("staff_id", "leave_type_id", "year");
CREATE INDEX "staff_leave_balances_institute_id_year_idx" ON "staff_leave_balances"("institute_id", "year");
