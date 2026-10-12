CREATE TYPE "StaffType" AS ENUM ('teaching', 'non_teaching');
CREATE TYPE "StaffStatus" AS ENUM ('active', 'resigned', 'terminated');

CREATE TABLE "staff_departments" (
  "department_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "staff_departments_institute_id_name_key" ON "staff_departments"("institute_id", "name");
CREATE INDEX "staff_departments_institute_id_idx" ON "staff_departments"("institute_id");

CREATE TABLE "staff_members" (
  "staff_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "staff_code" TEXT NOT NULL,
  "staff_type" "StaffType" NOT NULL,
  "full_name" TEXT NOT NULL,
  "department_id" INTEGER NOT NULL,
  "designation" TEXT NOT NULL,
  "employment_type" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "date_of_joining" DATE NOT NULL,
  "reporting_to_id" INTEGER,
  "status" "StaffStatus" NOT NULL DEFAULT 'active',
  "status_reason" TEXT,
  "relieved_on" DATE,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_members_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "staff_departments"("department_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "staff_members_reporting_to_id_fkey" FOREIGN KEY ("reporting_to_id") REFERENCES "staff_members"("staff_id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "staff_members_institute_id_staff_code_key" ON "staff_members"("institute_id", "staff_code");
CREATE INDEX "staff_members_institute_id_staff_type_idx" ON "staff_members"("institute_id", "staff_type");
CREATE INDEX "staff_members_institute_id_department_id_idx" ON "staff_members"("institute_id", "department_id");
CREATE INDEX "staff_members_institute_id_status_idx" ON "staff_members"("institute_id", "status");
CREATE INDEX "staff_members_institute_id_full_name_idx" ON "staff_members"("institute_id", "full_name");

CREATE TABLE "staff_dynamic_roles" (
  "role_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "permissions" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "staff_dynamic_roles_institute_id_name_key" ON "staff_dynamic_roles"("institute_id", "name");

CREATE TABLE "staff_user_dynamic_roles" (
  "id" SERIAL PRIMARY KEY,
  "institute_id" TEXT NOT NULL,
  "eddva_user_id" TEXT NOT NULL,
  "user_name" TEXT NOT NULL,
  "user_email" TEXT,
  "username" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "role_id" INTEGER NOT NULL,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_user_dynamic_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "staff_dynamic_roles"("role_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "staff_user_dynamic_roles_institute_id_eddva_user_id_key" ON "staff_user_dynamic_roles"("institute_id", "eddva_user_id");
CREATE UNIQUE INDEX "staff_user_dynamic_roles_institute_id_username_key" ON "staff_user_dynamic_roles"("institute_id", "username");

CREATE TABLE "staff_sso_sessions" (
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
CREATE UNIQUE INDEX "staff_sso_sessions_token_hash_key" ON "staff_sso_sessions"("token_hash");

CREATE TABLE "staff_permissions_catalog" (
  "permission_id" SERIAL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "is_system" BOOLEAN NOT NULL DEFAULT true,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "staff_permissions_catalog_key_key" ON "staff_permissions_catalog"("key");

CREATE TABLE "staff_number_sequences" (
  "id" SERIAL PRIMARY KEY,
  "sequence_type" TEXT NOT NULL,
  "financial_year" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "current_number" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "staff_number_sequences_sequence_type_financial_year_key" ON "staff_number_sequences"("sequence_type", "financial_year");
