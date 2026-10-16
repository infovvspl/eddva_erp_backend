-- Transport was the one module storing the raw signed session JWT at rest
-- (`transport_token`) instead of a SHA-256 hash like every other module's
-- *SsoSession table (hostel_sso_sessions.token_hash, staff_sso_sessions.token_hash,
-- etc.). Existing sessions are just 24h-TTL tokens, not durable data, so
-- they're dropped rather than migrated — anyone with a live session simply
-- re-exchanges on their next Transport request.

ALTER TABLE "transport_sso_sessions" DROP CONSTRAINT IF EXISTS "transport_sso_sessions_transport_token_key";
ALTER TABLE "transport_sso_sessions" DROP COLUMN "transport_token";
ALTER TABLE "transport_sso_sessions" ADD COLUMN "token_hash" TEXT;

-- Clear out old rows (no token_hash value for them) before enforcing NOT NULL + unique.
DELETE FROM "transport_sso_sessions";

ALTER TABLE "transport_sso_sessions" ALTER COLUMN "token_hash" SET NOT NULL;
CREATE UNIQUE INDEX "transport_sso_sessions_token_hash_key" ON "transport_sso_sessions"("token_hash");
