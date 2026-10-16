-- Simplified "Register Visitor" flow: a visit now records who the visitor
-- is (Parents/Guardian/Alumni/Vendor/Delivery Agency/Official/Others), the
-- agency/vendor they represent (where applicable), and which department
-- they're visiting, so "Person to Meet" can be filtered by department.

CREATE TYPE "FrontOfficeVisitorType" AS ENUM ('parents', 'guardian', 'alumni', 'vendor', 'delivery_agency', 'official', 'others');

ALTER TABLE "front_office_visitor_logs" ADD COLUMN "visitor_type" "FrontOfficeVisitorType";
ALTER TABLE "front_office_visitor_logs" ADD COLUMN "agency_vendor_name" TEXT;
ALTER TABLE "front_office_visitor_logs" ADD COLUMN "department_id" INTEGER;

ALTER TABLE "front_office_visitor_logs" ADD CONSTRAINT "front_office_visitor_logs_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "front_office_departments"("department_id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "front_office_visitor_logs_department_id_idx" ON "front_office_visitor_logs"("department_id");
