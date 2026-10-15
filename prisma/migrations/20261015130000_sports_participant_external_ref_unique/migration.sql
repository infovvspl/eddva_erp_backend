-- Enforce Student ID (external_ref_id) uniqueness per institute. Two
-- different participants could previously be saved with the identical
-- Student ID with no error (reported bug: "Arjun Mehta" and "Duplicate Test"
-- both saved with STD-2026-001).
--
-- If this fails with a unique-violation, duplicate (institute_id,
-- external_ref_id) rows already exist (e.g. test data from reproducing the
-- bug) and must be resolved by hand before re-running:
--   SELECT institute_id, external_ref_id, array_agg(participant_id) AS participant_ids
--   FROM sports_participants
--   WHERE external_ref_id IS NOT NULL
--   GROUP BY institute_id, external_ref_id
--   HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX "sports_participants_institute_id_external_ref_id_key" ON "sports_participants"("institute_id", "external_ref_id");
