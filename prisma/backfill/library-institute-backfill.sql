-- Library institute backfill. REVIEW BEFORE RUNNING; nothing runs this automatically.
--
-- Library tables had no institute, so the ERP cannot know which school each existing row
-- belongs to. This script covers the common case: ALL existing Library data belongs to ONE
-- institute. If existing rows belong to several schools, do NOT run it as-is; map them
-- yourself (e.g. by member/staff source) before assigning.
--
-- Usage:
--   psql "$DATABASE_URL" -v institute_id="'<institute uuid>'" -f prisma/backfill/library-institute-backfill.sql
--
-- Runs in one transaction and prints before/after counts. Roll back by replacing COMMIT with ROLLBACK.

\echo 'Rows without an institute (before):'
SELECT 'library_categories' AS tbl, count(*) FROM library_categories WHERE institute_id IS NULL
UNION ALL SELECT 'library_members', count(*) FROM library_members WHERE institute_id IS NULL
UNION ALL SELECT 'library_membership_rules', count(*) FROM library_membership_rules WHERE institute_id IS NULL
UNION ALL SELECT 'library_books', count(*) FROM library_books WHERE institute_id IS NULL
UNION ALL SELECT 'library_book_copies', count(*) FROM library_book_copies WHERE institute_id IS NULL
UNION ALL SELECT 'library_issue_records', count(*) FROM library_issue_records WHERE institute_id IS NULL
UNION ALL SELECT 'library_reservations', count(*) FROM library_reservations WHERE institute_id IS NULL
UNION ALL SELECT 'library_fines', count(*) FROM library_fines WHERE institute_id IS NULL;

BEGIN;

-- Root tables: the single institute given on the command line.
UPDATE library_categories       SET institute_id = :institute_id WHERE institute_id IS NULL;
UPDATE library_members          SET institute_id = :institute_id WHERE institute_id IS NULL;
UPDATE library_membership_rules SET institute_id = :institute_id WHERE institute_id IS NULL;
UPDATE library_books            SET institute_id = :institute_id WHERE institute_id IS NULL;

-- Dependent tables: inherit from their parent so the two can never disagree.
UPDATE library_book_copies c   SET institute_id = b.institute_id FROM library_books b   WHERE c.book_id   = b.book_id   AND c.institute_id IS NULL;
UPDATE library_issue_records i SET institute_id = c.institute_id FROM library_book_copies c WHERE i.copy_id = c.copy_id AND i.institute_id IS NULL;
UPDATE library_reservations r  SET institute_id = b.institute_id FROM library_books b   WHERE r.book_id   = b.book_id   AND r.institute_id IS NULL;
UPDATE library_fines f         SET institute_id = m.institute_id FROM library_members m WHERE f.member_id = m.member_id AND f.institute_id IS NULL;

-- Safety check: a child that belongs to a different institute than its parent means the
-- data was mixed. Abort instead of committing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM library_issue_records i JOIN library_members m ON m.member_id = i.member_id
    WHERE i.institute_id IS DISTINCT FROM m.institute_id
  ) THEN
    RAISE EXCEPTION 'Issue records and their members belong to different institutes; aborting';
  END IF;
END $$;

COMMIT;

\echo 'Rows still without an institute (after; expect all zero):'
SELECT 'library_categories' AS tbl, count(*) FROM library_categories WHERE institute_id IS NULL
UNION ALL SELECT 'library_members', count(*) FROM library_members WHERE institute_id IS NULL
UNION ALL SELECT 'library_membership_rules', count(*) FROM library_membership_rules WHERE institute_id IS NULL
UNION ALL SELECT 'library_books', count(*) FROM library_books WHERE institute_id IS NULL
UNION ALL SELECT 'library_book_copies', count(*) FROM library_book_copies WHERE institute_id IS NULL
UNION ALL SELECT 'library_issue_records', count(*) FROM library_issue_records WHERE institute_id IS NULL
UNION ALL SELECT 'library_reservations', count(*) FROM library_reservations WHERE institute_id IS NULL
UNION ALL SELECT 'library_fines', count(*) FROM library_fines WHERE institute_id IS NULL;
