-- Links an ERP user to its identity in eddva_platform.
ALTER TABLE "users" ADD COLUMN "platformUserId" TEXT;
CREATE UNIQUE INDEX "users_platformUserId_key" ON "users"("platformUserId");
