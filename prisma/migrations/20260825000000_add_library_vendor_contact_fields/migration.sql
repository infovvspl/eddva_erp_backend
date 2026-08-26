ALTER TABLE "library_book_vendors"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "contact_person" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "address" TEXT;

UPDATE "library_book_vendors"
SET "name" = "vendor_name"
WHERE "name" IS NULL;
