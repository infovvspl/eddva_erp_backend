-- DropForeignKey
ALTER TABLE "front_office_appointments" DROP CONSTRAINT "front_office_appointments_created_by_fkey";

-- DropForeignKey
ALTER TABLE "front_office_attachments" DROP CONSTRAINT "front_office_attachments_uploaded_by_fkey";

-- DropForeignKey
ALTER TABLE "front_office_complaint_updates" DROP CONSTRAINT "front_office_complaint_updates_updated_by_fkey";

-- DropForeignKey
ALTER TABLE "front_office_complaints" DROP CONSTRAINT "front_office_complaints_created_by_fkey";

-- DropForeignKey
ALTER TABLE "front_office_enquiries" DROP CONSTRAINT "front_office_enquiries_created_by_fkey";

-- DropForeignKey
ALTER TABLE "front_office_enquiry_followups" DROP CONSTRAINT "front_office_enquiry_followups_updated_by_fkey";

-- DropForeignKey
ALTER TABLE "front_office_visitor_logs" DROP CONSTRAINT "front_office_visitor_logs_created_by_fkey";

-- DropForeignKey
ALTER TABLE "front_office_visitors" DROP CONSTRAINT "front_office_visitors_created_by_fkey";

-- CreateTable
CREATE TABLE "front_office_dynamic_roles" (
    "role_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "front_office_dynamic_roles_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "front_office_user_dynamic_roles" (
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

    CONSTRAINT "front_office_user_dynamic_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "front_office_sso_sessions" (
    "session_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "eddva_user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT,
    "user_role" TEXT NOT NULL,
    "fo_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "front_office_sso_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "front_office_permissions_catalog" (
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

    CONSTRAINT "front_office_permissions_catalog_pkey" PRIMARY KEY ("permission_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "front_office_dynamic_roles_institute_id_name_key" ON "front_office_dynamic_roles"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "front_office_user_dynamic_roles_institute_id_eddva_user_id_key" ON "front_office_user_dynamic_roles"("institute_id", "eddva_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "front_office_user_dynamic_roles_institute_id_username_key" ON "front_office_user_dynamic_roles"("institute_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "front_office_sso_sessions_fo_token_key" ON "front_office_sso_sessions"("fo_token");

-- CreateIndex
CREATE UNIQUE INDEX "front_office_permissions_catalog_key_key" ON "front_office_permissions_catalog"("key");

-- AddForeignKey
ALTER TABLE "front_office_user_dynamic_roles" ADD CONSTRAINT "front_office_user_dynamic_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "front_office_dynamic_roles"("role_id") ON DELETE CASCADE ON UPDATE CASCADE;
