-- Enforce admission number uniqueness per institute. Two different residents
-- could previously be saved with the identical admission_no with no error.
--
-- If this fails with a unique-violation, duplicate (institute_id, admission_no)
-- rows already exist and must be resolved by hand before re-running:
--   SELECT institute_id, admission_no, array_agg(resident_id) AS resident_ids
--   FROM hostel_residents
--   WHERE admission_no IS NOT NULL
--   GROUP BY institute_id, admission_no
--   HAVING COUNT(*) > 1;

DROP INDEX "hostel_residents_institute_id_admission_no_idx";

CREATE UNIQUE INDEX "hostel_residents_institute_id_admission_no_key" ON "hostel_residents"("institute_id", "admission_no");
