-- Front Office institute backfill. REVIEW BEFORE RUNNING; nothing runs this automatically.
--
-- Front Office tables had no institute, so the ERP cannot know which school each existing
-- row belongs to. This script covers the common case: ALL existing Front Office data
-- belongs to ONE institute. If existing rows belong to several schools, do NOT run it
-- as-is; map them yourself before assigning.
--
-- Usage:
--   psql "$DATABASE_URL" -v institute_id="'<institute uuid>'" -f prisma/backfill/front-office-institute-backfill.sql
--
-- Runs in one transaction and prints before/after counts. Roll back by replacing COMMIT with ROLLBACK.

\echo 'Rows without an institute (before):'
SELECT 'front_office_departments' AS tbl, count(*) FROM front_office_departments WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_employees', count(*) FROM front_office_employees WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_availability_slots', count(*) FROM front_office_availability_slots WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_visitors', count(*) FROM front_office_visitors WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_visitor_logs', count(*) FROM front_office_visitor_logs WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_enquiries', count(*) FROM front_office_enquiries WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_enquiry_followups', count(*) FROM front_office_enquiry_followups WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_appointments', count(*) FROM front_office_appointments WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_complaints', count(*) FROM front_office_complaints WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_complaint_updates', count(*) FROM front_office_complaint_updates WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_attachments', count(*) FROM front_office_attachments WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_notifications', count(*) FROM front_office_notifications WHERE institute_id IS NULL;

BEGIN;

-- Root tables: the single institute given on the command line.
UPDATE front_office_departments SET institute_id = :institute_id WHERE institute_id IS NULL;
UPDATE front_office_visitors    SET institute_id = :institute_id WHERE institute_id IS NULL;

-- Employees inherit from their department.
UPDATE front_office_employees e SET institute_id = d.institute_id FROM front_office_departments d WHERE e.department_id = d.department_id AND e.institute_id IS NULL;

-- Availability slots inherit from their employee.
UPDATE front_office_availability_slots s SET institute_id = e.institute_id FROM front_office_employees e WHERE s.employee_id = e.employee_id AND s.institute_id IS NULL;

-- Appointments inherit from their department (every appointment has one).
UPDATE front_office_appointments a SET institute_id = d.institute_id FROM front_office_departments d WHERE a.department_id = d.department_id AND a.institute_id IS NULL;

-- Visitor logs inherit from their host employee.
UPDATE front_office_visitor_logs l SET institute_id = e.institute_id FROM front_office_employees e WHERE l.host_employee_id = e.employee_id AND l.institute_id IS NULL;

-- Enquiries and complaints have no required parent (assigned_to is optional): the
-- single institute given on the command line, same as the root tables.
UPDATE front_office_enquiries   SET institute_id = :institute_id WHERE institute_id IS NULL;
UPDATE front_office_complaints  SET institute_id = :institute_id WHERE institute_id IS NULL;

-- Followups and complaint updates inherit from their parent record.
UPDATE front_office_enquiry_followups f SET institute_id = q.institute_id FROM front_office_enquiries q WHERE f.enquiry_id = q.enquiry_id AND f.institute_id IS NULL;
UPDATE front_office_complaint_updates u SET institute_id = c.institute_id FROM front_office_complaints c WHERE u.complaint_id = c.complaint_id AND u.institute_id IS NULL;

-- Attachments and notifications are polymorphic (entity_type/entity_id, no FK):
-- inherit from whichever of the three entity tables the row points at.
UPDATE front_office_attachments a SET institute_id = v.institute_id FROM front_office_visitors v WHERE a.entity_type = 'visitor' AND a.entity_id = v.visitor_id AND a.institute_id IS NULL;
UPDATE front_office_attachments a SET institute_id = q.institute_id FROM front_office_enquiries q WHERE a.entity_type = 'enquiry' AND a.entity_id = q.enquiry_id AND a.institute_id IS NULL;
UPDATE front_office_attachments a SET institute_id = c.institute_id FROM front_office_complaints c WHERE a.entity_type = 'complaint' AND a.entity_id = c.complaint_id AND a.institute_id IS NULL;

UPDATE front_office_notifications n SET institute_id = e.institute_id FROM front_office_employees e WHERE n.recipient_employee_id = e.employee_id AND n.institute_id IS NULL;
-- A notification with no recipient employee on record: fall back to the single institute.
UPDATE front_office_notifications SET institute_id = :institute_id WHERE institute_id IS NULL AND recipient_employee_id IS NULL;

-- Safety check: a child that belongs to a different institute than its parent means the
-- data was mixed. Abort instead of committing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM front_office_employees e JOIN front_office_departments d ON d.department_id = e.department_id
    WHERE e.institute_id IS DISTINCT FROM d.institute_id
  ) THEN
    RAISE EXCEPTION 'Employees and their departments belong to different institutes; aborting';
  END IF;
END $$;

COMMIT;

\echo 'Rows still without an institute (after; expect all zero, except any notification whose entity vanished):'
SELECT 'front_office_departments' AS tbl, count(*) FROM front_office_departments WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_employees', count(*) FROM front_office_employees WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_availability_slots', count(*) FROM front_office_availability_slots WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_visitors', count(*) FROM front_office_visitors WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_visitor_logs', count(*) FROM front_office_visitor_logs WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_enquiries', count(*) FROM front_office_enquiries WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_enquiry_followups', count(*) FROM front_office_enquiry_followups WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_appointments', count(*) FROM front_office_appointments WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_complaints', count(*) FROM front_office_complaints WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_complaint_updates', count(*) FROM front_office_complaint_updates WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_attachments', count(*) FROM front_office_attachments WHERE institute_id IS NULL
UNION ALL SELECT 'front_office_notifications', count(*) FROM front_office_notifications WHERE institute_id IS NULL;
