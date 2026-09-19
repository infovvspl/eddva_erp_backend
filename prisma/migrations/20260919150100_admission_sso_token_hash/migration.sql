-- The SSO session log stores a sha256 of the issued token rather than the token itself.
ALTER TABLE "admission_sso_sessions" RENAME COLUMN "admission_token" TO "token_hash";
ALTER INDEX "admission_sso_sessions_admission_token_key" RENAME TO "admission_sso_sessions_token_hash_key";
