CREATE TYPE "FeeStudentStatus" AS ENUM ('active', 'inactive');
CREATE TYPE "FeePaymentMode" AS ENUM ('cash', 'card', 'upi', 'bank_transfer', 'online');

CREATE TABLE "fee_sso_sessions" (
  "session_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "eddva_user_id" TEXT NOT NULL,
  "user_name" TEXT NOT NULL,
  "user_email" TEXT,
  "user_role" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "fee_sso_sessions_token_hash_key" ON "fee_sso_sessions"("token_hash");
CREATE INDEX "fee_sso_sessions_institute_id_idx" ON "fee_sso_sessions"("institute_id");

CREATE TABLE "fee_classes" (
  "class_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "academic_year" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "fee_classes_institute_id_name_academic_year_key" ON "fee_classes"("institute_id", "name", "academic_year");
CREATE INDEX "fee_classes_institute_id_academic_year_idx" ON "fee_classes"("institute_id", "academic_year");

CREATE TABLE "fee_students" (
  "student_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "class_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "roll_no" TEXT,
  "guardian_name" TEXT,
  "guardian_contact" TEXT,
  "status" "FeeStudentStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fee_students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "fee_classes"("class_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "fee_students_institute_id_class_id_idx" ON "fee_students"("institute_id", "class_id");

CREATE TABLE "fee_structures_classwise" (
  "structure_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "class_id" INTEGER NOT NULL,
  "term_name" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "due_date" DATE NOT NULL,
  "academic_year" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fee_structures_classwise_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "fee_classes"("class_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "fee_structures_classwise_institute_id_class_id_term_name_academic_year_key" ON "fee_structures_classwise"("institute_id", "class_id", "term_name", "academic_year");
CREATE INDEX "fee_structures_classwise_institute_id_academic_year_idx" ON "fee_structures_classwise"("institute_id", "academic_year");

CREATE TABLE "fee_payments_classwise" (
  "payment_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "student_id" INTEGER NOT NULL,
  "structure_id" INTEGER NOT NULL,
  "amount_paid" DECIMAL(12,2) NOT NULL,
  "payment_date" DATE NOT NULL,
  "payment_mode" "FeePaymentMode" NOT NULL,
  "transaction_ref" TEXT,
  "receipt_number" TEXT NOT NULL,
  "recorded_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fee_payments_classwise_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "fee_students"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fee_payments_classwise_structure_id_fkey" FOREIGN KEY ("structure_id") REFERENCES "fee_structures_classwise"("structure_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "fee_payments_classwise_institute_id_receipt_number_key" ON "fee_payments_classwise"("institute_id", "receipt_number");
CREATE INDEX "fee_payments_classwise_institute_id_student_id_idx" ON "fee_payments_classwise"("institute_id", "student_id");
CREATE INDEX "fee_payments_classwise_institute_id_structure_id_idx" ON "fee_payments_classwise"("institute_id", "structure_id");

CREATE TABLE "fee_number_sequences" (
  "institute_id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,

  PRIMARY KEY ("institute_id", "year")
);
