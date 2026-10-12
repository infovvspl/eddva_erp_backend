CREATE TYPE "PayrollRunStatus" AS ENUM ('draft', 'finalized', 'paid');

CREATE TABLE "staff_salary_structures" (
  "structure_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "staff_id" INTEGER NOT NULL,
  "basic_salary" DECIMAL(12,2) NOT NULL,
  "allowances" JSONB NOT NULL DEFAULT '{}',
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_salary_structures_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("staff_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "staff_salary_structures_institute_id_staff_id_effective_from_idx" ON "staff_salary_structures"("institute_id", "staff_id", "effective_from");

CREATE TABLE "staff_payroll_runs" (
  "run_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "status" "PayrollRunStatus" NOT NULL DEFAULT 'draft',
  "generated_by" TEXT,
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalized_by" TEXT,
  "finalized_at" TIMESTAMP(3),
  "paid_by" TEXT,
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "staff_payroll_runs_institute_id_month_year_key" ON "staff_payroll_runs"("institute_id", "month", "year");

CREATE TABLE "staff_payslips" (
  "payslip_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "run_id" INTEGER NOT NULL,
  "staff_id" INTEGER NOT NULL,
  "basic_salary" DECIMAL(12,2) NOT NULL,
  "allowances_total" DECIMAL(12,2) NOT NULL,
  "gross_salary" DECIMAL(12,2) NOT NULL,
  "lop_days" DECIMAL(5,1) NOT NULL DEFAULT 0,
  "lop_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "other_deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "net_salary" DECIMAL(12,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_payslips_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "staff_payroll_runs"("run_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "staff_payslips_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("staff_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "staff_payslips_run_id_staff_id_key" ON "staff_payslips"("run_id", "staff_id");
CREATE INDEX "staff_payslips_institute_id_staff_id_idx" ON "staff_payslips"("institute_id", "staff_id");
