import type { PrismaClient } from '@prisma/client';

/**
 * Seeds ~6 months (2026-05-01 .. 2026-10-14) of realistic FRONT OFFICE
 * transactional data for `instId`: departments/employees, visitors & visitor
 * logs, enquiries (+ followups), appointments and complaints (+ updates), so
 * the front-office dashboard (visitors, enquiries, appointments, complaints)
 * and the main dashboard's front-office summary are populated.
 *
 * Safe to re-run: if the institute already has the seeded departments, this
 * is a no-op.
 */
export async function seedFrontOffice(prisma: PrismaClient, instId: string): Promise<void> {
  const existing = await prisma.frontOfficeDepartment.findFirst({
    where: { institute_id: instId, name: 'Admissions Desk' },
    select: { department_id: true },
  });
  if (existing) {
    console.log('  [front-office] already seeded — skipping');
    return;
  }

  const TODAY = new Date('2026-10-14T00:00:00.000Z');
  const WINDOW_START = new Date('2026-05-01T00:00:00.000Z');

  const rand = (n: number) => Math.floor(Math.random() * n);
  const pick = <T>(arr: readonly T[]): T => arr[rand(arr.length)];
  const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);
  const randomDateBetween = (start: Date, end: Date) =>
    new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  const dateOnly = (d: Date) => new Date(d.toISOString().slice(0, 10) + 'T00:00:00.000Z');

  console.log('  [front-office] seeding departments & employees...');

  const departmentDefs = ['Admissions Desk', 'Accounts', 'Academics', 'Administration'];
  const departments: Array<Awaited<ReturnType<typeof prisma.frontOfficeDepartment.create>>> = [];
  for (const name of departmentDefs) {
    const dept = await prisma.frontOfficeDepartment.create({
      data: { institute_id: instId, name, status: 'ACTIVE' },
    });
    departments.push(dept);
  }

  const employeeFirstNames = ['Anil', 'Sunita', 'Rajesh', 'Meera', 'Vikas', 'Pooja', 'Sanjay', 'Geeta'];
  const employeeLastNames = ['Kapoor', 'Joshi', 'Malhotra', 'Chawla', 'Bhatt', 'Rao', 'Pillai', 'Shetty'];
  let employeeSeq = 0;
  const employees: Array<Awaited<ReturnType<typeof prisma.frontOfficeEmployee.create>>> = [];
  for (const dept of departments) {
    for (let i = 0; i < 2; i++) {
      employeeSeq++;
      const emp = await prisma.frontOfficeEmployee.create({
        data: {
          institute_id: instId,
          name: `${pick(employeeFirstNames)} ${pick(employeeLastNames)}`,
          department_id: dept.department_id,
          designation: i === 0 ? 'Front Office Executive' : 'Front Office Assistant',
          email: `fo-staff-${employeeSeq}@eddva-demo.com`,
          phone: `9${String(850000000 + employeeSeq).padStart(9, '0')}`,
          status: 'ACTIVE',
        },
      });
      employees.push(emp);
    }
  }

  // ─── Visitors + visitor logs ───────────────────────────────────────────
  console.log('  [front-office] seeding visitors & visitor logs...');
  const visitorFirstNames = ['Arjun', 'Kavita', 'Deepak', 'Nisha', 'Manoj', 'Sunita', 'Rakesh', 'Anita'];
  const visitorLastNames = ['Sharma', 'Verma', 'Gupta', 'Reddy', 'Nair', 'Iyer', 'Menon', 'Patel'];

  const NUM_VISITOR_LOGS = 150;
  let badgeSeq = 0;
  for (let i = 0; i < NUM_VISITOR_LOGS; i++) {
    const visitor = await prisma.frontOfficeVisitor.create({
      data: {
        institute_id: instId,
        full_name: `${pick(visitorFirstNames)} ${pick(visitorLastNames)}`,
        phone: `9${String(860000000 + i).padStart(9, '0')}`,
        organization: rand(100) < 30 ? 'Self (Parent)' : undefined,
        created_by: 'seed-script',
      },
    });

    // Last 5 of the batch land "today" so today_visitors / currently_checked_in are non-zero.
    const isToday = i >= NUM_VISITOR_LOGS - 5;
    const checkInTime = isToday
      ? new Date(TODAY.getTime() + (1 + rand(6)) * 3600000)
      : randomDateBetween(WINDOW_START, addDays(TODAY, -1));
    const host = pick(employees);
    const stillIn = isToday && rand(100) < 60;
    badgeSeq++;

    await prisma.frontOfficeVisitorLog.create({
      data: {
        institute_id: instId,
        visitor_id: visitor.visitor_id,
        host_employee_id: host.employee_id,
        purpose: pick(['Admission enquiry', 'Fee payment', 'Meeting with teacher', 'Document submission', 'General visit']),
        badge_number: `V-${String(badgeSeq).padStart(5, '0')}`,
        check_in_time: checkInTime,
        check_out_time: stillIn ? null : addDays(checkInTime, 0),
        status: stillIn ? 'checked_in' : 'checked_out',
        created_by: 'seed-script',
      },
    });
  }

  // ─── Enquiries + followups ─────────────────────────────────────────────
  console.log('  [front-office] seeding enquiries...');
  const enquirySources: Array<'walk_in' | 'phone' | 'email' | 'website'> = ['walk_in', 'phone', 'email', 'website'];
  const enquiryCategories = ['Admissions', 'Fees', 'Transport', 'Academics', 'General'];

  const NUM_ENQUIRIES = 120;
  for (let i = 0; i < NUM_ENQUIRIES; i++) {
    const createdAt = randomDateBetween(WINDOW_START, TODAY);
    const roll = rand(100);
    const status: 'open' | 'in_progress' | 'closed' = roll < 30 ? 'open' : roll < 55 ? 'in_progress' : 'closed';
    const assignTo = rand(100) < 80 ? pick(employees).employee_id : null;

    const enquiry = await prisma.frontOfficeEnquiry.create({
      data: {
        institute_id: instId,
        enquirer_name: `${pick(visitorFirstNames)} ${pick(visitorLastNames)}`,
        phone: `9${String(870000000 + i).padStart(9, '0')}`,
        email: `enquirer${i}@example.com`,
        source: pick(enquirySources),
        category: pick(enquiryCategories),
        description: 'General enquiry regarding institute services',
        assigned_to: assignTo,
        status,
        created_by: 'seed-script',
        created_at: createdAt,
        updated_at: createdAt,
      },
    });

    if (status !== 'closed') {
      const nextFollowupDate = rand(100) < 50 ? addDays(TODAY, -rand(5)) : addDays(TODAY, 1 + rand(10));
      await prisma.frontOfficeEnquiryFollowup.create({
        data: {
          institute_id: instId,
          enquiry_id: enquiry.enquiry_id,
          notes: 'Followed up with enquirer regarding their query.',
          followup_date: randomDateBetween(createdAt, TODAY),
          next_followup_date: nextFollowupDate,
          updated_by: 'seed-script',
        },
      });
    }
  }

  // ─── Appointments ───────────────────────────────────────────────────────
  console.log('  [front-office] seeding appointments...');
  const NUM_APPOINTMENTS = 100;
  for (let i = 0; i < NUM_APPOINTMENTS; i++) {
    const isToday = i < 6; // a handful scheduled for today
    const apptDate = isToday ? TODAY : dateOnly(randomDateBetween(WINDOW_START, addDays(TODAY, 20)));
    const dept = pick(departments);
    const host = employees.find((e) => e.department_id === dept.department_id) ?? pick(employees);
    const startHour = 9 + rand(8);
    const startTime = new Date(apptDate.getTime() + startHour * 3600000);
    const endTime = new Date(startTime.getTime() + 30 * 60000);

    let status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
    if (apptDate > TODAY) {
      status = pick(['scheduled', 'confirmed'] as const);
    } else if (apptDate.getTime() === TODAY.getTime()) {
      status = pick(['scheduled', 'confirmed'] as const);
    } else {
      const roll = rand(100);
      status = roll < 70 ? 'completed' : roll < 85 ? 'no_show' : 'cancelled';
    }

    await prisma.frontOfficeAppointment.create({
      data: {
        institute_id: instId,
        visitor_name: `${pick(visitorFirstNames)} ${pick(visitorLastNames)}`,
        phone: `9${String(880000000 + i).padStart(9, '0')}`,
        host_employee_id: host.employee_id,
        department_id: dept.department_id,
        appointment_date: apptDate,
        start_time: startTime,
        end_time: endTime,
        purpose: pick(['Admission discussion', 'Fee query', 'Academic counselling', 'General meeting']),
        status,
        created_by: 'seed-script',
      },
    });
  }

  // ─── Complaints + updates ───────────────────────────────────────────────
  console.log('  [front-office] seeding complaints...');
  const complaintCategories = ['Facilities', 'Staff Behaviour', 'Transport', 'Cleanliness', 'Administration'];
  const complaintPriorities: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical'];

  const NUM_COMPLAINTS = 60;
  for (let i = 0; i < NUM_COMPLAINTS; i++) {
    const createdAt = randomDateBetween(WINDOW_START, TODAY);
    const roll = rand(100);
    const status: 'open' | 'in_progress' | 'resolved' | 'closed' =
      roll < 20 ? 'open' : roll < 35 ? 'in_progress' : roll < 75 ? 'resolved' : 'closed';
    const assignTo = status === 'open' ? null : pick(employees).employee_id;
    const resolvedAt = status === 'resolved' || status === 'closed' ? addDays(createdAt, 1 + rand(6)) : null;

    const complaint = await prisma.frontOfficeComplaint.create({
      data: {
        institute_id: instId,
        complainant_name: `${pick(visitorFirstNames)} ${pick(visitorLastNames)}`,
        phone: `9${String(890000000 + i).padStart(9, '0')}`,
        category: pick(complaintCategories),
        description: 'Complaint raised regarding institute services',
        priority: pick(complaintPriorities),
        status,
        assigned_to: assignTo,
        created_by: 'seed-script',
        created_at: createdAt,
        resolved_at: resolvedAt,
        updated_at: resolvedAt ?? createdAt,
      },
    });

    if (resolvedAt) {
      await prisma.frontOfficeComplaintUpdate.create({
        data: {
          institute_id: instId,
          complaint_id: complaint.complaint_id,
          notes: 'Issue investigated and resolved by assigned staff.',
          status_change: status,
          updated_by: 'seed-script',
          updated_at: resolvedAt,
        },
      });
    }
  }

  console.log('  [front-office] done.');
}
