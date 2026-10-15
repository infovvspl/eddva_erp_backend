-- Library vendor master data: a vendor is now a reusable, institute-wide
-- record instead of being retyped per book. Existing per-book vendor rows
-- (library_book_vendors) are untouched and keep working as free-text
-- snapshots; the new nullable vendor_id lets new entries link back to the
-- shared master.

CREATE TABLE "library_vendors" (
  "vendor_id" SERIAL PRIMARY KEY,
  "institute_id" TEXT,
  "vendor_name" TEXT NOT NULL,
  "contact_person" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "library_vendors_institute_id_vendor_name_key" ON "library_vendors"("institute_id", "vendor_name");
CREATE INDEX "library_vendors_institute_id_idx" ON "library_vendors"("institute_id");

ALTER TABLE "library_book_vendors" ADD COLUMN "vendor_id" INTEGER;
ALTER TABLE "library_book_vendors" ADD CONSTRAINT "library_book_vendors_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "library_vendors"("vendor_id") ON DELETE SET NULL ON UPDATE CASCADE;
