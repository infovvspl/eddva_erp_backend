import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Transactional demo data for the Staff module. Its own dashboard
 * (src/staff/dashboard/dashboard.service.ts) reads StaffMember
 * totals/active/by_type/by_status/by_department, so the department +
 * status + type spread below is what drives those charts. Leave
 * (applications/balances) and payroll (salary structures / payroll runs /
 * payslips) data is also seeded, spread across the last 6 months, so the
 * leave and payroll screens this module ships are populated too.
 *
 * "Today" for the institute is 2026-10-14; dates are anchored to that fixed
 * point rather than the real system clock, spanning roughly May 2026 - Oct
 * 2026.
 *
 * Safe to re-run: guarded by an early-return once enough staff members
 * already exist for this institute.
 */

const TODAY = new Date('2026-10-14T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const MIN_STAFF = 30;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

const FIRST_NAMES = [
  'Anita', 'Suresh', 'Kavya', 'Manoj', 'Divya', 'Ramesh', 'Shalini', 'Vijay',
  'Nisha', 'Ajay', 'Pooja', 'Sanjay', 'Geeta', 'Harish', 'Swati', 'Deepak',
  'Lata', 'Mohan', 'Rekha', 'Anil', 'Meena', 'Kiran', 'Usha', 'Rajesh',
  'Shobha', 'Prakash', 'Vani', 'Naresh', 'Jyoti', 'Vinod',
];
const LAST_NAMES = [
  'Sharma', 'Verma', 'Gupta', 'Iyer', 'Nair', 'Reddy', 'Rao', 'Patel',
  'Mehta', 'Joshi', 'Kulkarni', 'Pillai', 'Chopra', 'Malhotra', 'Bose', 'Desai',
];

const TEACHING_DESIGNATIONS = ['Teacher', 'Senior Teacher', 'Subject Head', 'Vice Principal', 'Principal'];
const NON_TEACHING_DESIGNATIONS = ['Accountant', 'Librarian', 'Admin Assistant', 'Lab Assistant', 'Receptionist', 'IT Support'];

export async function seedStaff(prisma: PrismaClient, instId: string): Promise<void> {
  const existing = await prisma.staffMember.count({ where: { institute_id: instId } });
  if (existing >= MIN_STAFF) {
    console.log(`  (staff) already has ${existing} members — skipping`);
    return;
  }

  // ---- Departments ----------------------------------------------------------
  const departmentDefs = ['Mathematics', 'Science', 'Languages', 'Social Studies', 'Administration', 'Physical Education'];
  const departmentIds: number[] = [];
  for (const name of departmentDefs) {
    const dept = await prisma.staffDepartment.upsert({
      where: { institute_id_name: { institute_id: instId, name } },
      update: {},
      create: { institute_id: instId, name, description: `${name} department` },
    });
    departmentIds.push(dept.department_id);
  }

  // ---- Staff members ----------------------------------------------------------
  const STAFF_COUNT = 40;
  const staffIds: number[] = [];
  const staffMeta: Array<{ id: number; status: string }> = [];

  // Pick a principal first so others can report to someone.
  let principalId: number | null = null;

  for (let i = 1; i <= STAFF_COUNT; i++) {
    const staffType = i % 10 < 7 ? 'teaching' : 'non_teaching';
    const designation =
      i === 1
        ? 'Principal'
        : staffType === 'teaching'
          ? pick(TEACHING_DESIGNATIONS)
          : pick(NON_TEACHING_DESIGNATIONS);
    const dateOfJoining = new Date(
      2026 - randInt(1, 15),
      randInt(0, 11),
      randInt(1, 28),
    );
    const statusRoll = randInt(1, 100);
    const status = statusRoll <= 90 ? 'active' : statusRoll <= 96 ? 'resigned' : 'terminated';
    const relievedOn = status !== 'active' ? addDays(TODAY, -randInt(5, 150)) : null;

    const staff = await prisma.staffMember.create({
      data: {
        institute_id: instId,
        staff_code: `STF-${String(i).padStart(4, '0')}`,
        staff_type: staffType as any,
        full_name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        department_id: departmentIds[i % departmentIds.length],
        designation,
        employment_type: staffType === 'teaching' ? 'full_time' : pick(['full_time', 'part_time']),
        email: `staff.seed.${i}@inst-demo-staff.test`,
        phone: `9${randInt(100000000, 999999999)}`,
        date_of_joining: dateOfJoining,
        reporting_to_id: i === 1 ? null : principalId,
        status: status as any,
        status_reason: status !== 'active' ? pick(['Resigned for personal reasons', 'Contract ended', 'Relocation']) : null,
        relieved_on: relievedOn,
        created_by: 'seed-script@eddva.com',
      },
    });
    if (i === 1) principalId = staff.staff_id;
    staffIds.push(staff.staff_id);
    staffMeta.push({ id: staff.staff_id, status });
  }

  const activeStaff = staffMeta.filter((s) => s.status === 'active').map((s) => s.id);

  // ---- Leave types ----------------------------------------------------------
  const leaveTypeDefs = [
    { name: 'Casual Leave', code: 'CL', quota: 12, applicable: null as 'teaching' | 'non_teaching' | null },
    { name: 'Sick Leave', code: 'SL', quota: 10, applicable: null },
    { name: 'Earned Leave', code: 'EL', quota: 15, applicable: null },
    { name: 'Maternity Leave', code: 'ML', quota: 90, applicable: null },
    { name: 'Loss of Pay', code: 'LOP', quota: 0, applicable: null, paid: false },
  ];
  const leaveTypeIds: Array<{ id: number; code: string; quota: number }> = [];
  for (const def of leaveTypeDefs) {
    const lt = await prisma.leaveType.upsert({
      where: { institute_id_code: { institute_id: instId, code: def.code } },
      update: {},
      create: {
        institute_id: instId,
        name: def.name,
        code: def.code,
        applicable_staff_type: def.applicable ?? undefined,
        annual_quota_days: def.quota,
        is_paid: def.code !== 'LOP',
        allow_carry_forward: def.code === 'EL',
        max_carry_forward_days: def.code === 'EL' ? 10 : null,
      },
    });
    leaveTypeIds.push({ id: lt.leave_type_id, code: lt.code, quota: def.quota });
  }

  // ---- Leave balances (year 2026, one per active staff per leave type) -----
  const balanceRows: Prisma.LeaveBalanceCreateManyInput[] = [];
  for (const staffId of activeStaff) {
    for (const lt of leaveTypeIds) {
      if (lt.quota === 0) continue; // LOP has no allocation to track as a balance
      const used = randInt(0, Math.floor(lt.quota * 0.6));
      balanceRows.push({
        institute_id: instId,
        staff_id: staffId,
        leave_type_id: lt.id,
        year: 2026,
        allocated_days: lt.quota,
        used_days: used,
      });
    }
  }
  await prisma.leaveBalance.createMany({ data: balanceRows, skipDuplicates: true });

  // ---- Leave applications spread over the last 6 months --------------------
  const LEAVE_APPLICATION_COUNT = 160;
  const leaveRows: Prisma.LeaveApplicationCreateManyInput[] = [];
  for (let i = 0; i < LEAVE_APPLICATION_COUNT; i++) {
    const staffId = pick(activeStaff);
    const leaveType = pick(leaveTypeIds);
    const fromOffset = randInt(-180, -1);
    const fromDate = addDays(TODAY, fromOffset);
    const days = leaveType.code === 'ML' ? randInt(30, 90) : randInt(1, 4);
    const toDate = addDays(fromDate, days - 1);
    const statusRoll = randInt(1, 100);
    const status = statusRoll <= 65 ? 'approved' : statusRoll <= 80 ? 'pending' : statusRoll <= 93 ? 'rejected' : 'cancelled';

    leaveRows.push({
      institute_id: instId,
      staff_id: staffId,
      leave_type_id: leaveType.id,
      from_date: fromDate,
      to_date: toDate,
      days_count: days,
      is_half_day: days === 1 && randInt(1, 100) <= 15,
      reason: pick(['Personal work', 'Family function', 'Medical appointment', 'Rest and recovery', 'Travel']),
      status: status as any,
      applied_by: 'seed-script@eddva.com',
      decided_by: status === 'pending' ? null : 'seed-script@eddva.com',
      decided_at: status === 'pending' ? null : addDays(fromDate, -1),
    });
  }
  await prisma.leaveApplication.createMany({ data: leaveRows });

  // ---- Salary structures (one effective-dated row per active staff) --------
  const salaryByStaff = new Map<number, number>();
  for (const staffId of activeStaff) {
    const basic = randInt(25000, 90000);
    salaryByStaff.set(staffId, basic);
    await prisma.staffSalaryStructure.create({
      data: {
        institute_id: instId,
        staff_id: staffId,
        basic_salary: basic,
        allowances: { hra: Math.round(basic * 0.4), da: Math.round(basic * 0.1), transport: 1600 },
        deductions: { pf: Math.round(basic * 0.12), professional_tax: 200 },
        effective_from: new Date('2026-04-01T00:00:00.000Z'),
      },
    });
  }

  // ---- Payroll runs + payslips for the last 5 months (May-Sep 2026) --------
  const payrollMonths = [
    { month: 5, year: 2026 },
    { month: 6, year: 2026 },
    { month: 7, year: 2026 },
    { month: 8, year: 2026 },
    { month: 9, year: 2026 },
  ];

  for (const pm of payrollMonths) {
    const run = await prisma.payrollRun.upsert({
      where: { institute_id_month_year: { institute_id: instId, month: pm.month, year: pm.year } },
      update: {},
      create: {
        institute_id: instId,
        month: pm.month,
        year: pm.year,
        status: 'paid',
        generated_by: 'seed-script@eddva.com',
        finalized_by: 'seed-script@eddva.com',
        finalized_at: new Date(pm.year, pm.month - 1, 28),
        paid_by: 'seed-script@eddva.com',
        paid_at: new Date(pm.year, pm.month - 1, 28),
      },
    });

    const payslipRows: Prisma.PayslipCreateManyInput[] = [];
    for (const staffId of activeStaff) {
      const basic = salaryByStaff.get(staffId) ?? 30000;
      const allowancesTotal = Math.round(basic * 0.5) + 1600;
      const grossSalary = basic + allowancesTotal;
      const lopDays = randInt(1, 100) <= 10 ? randInt(1, 2) : 0;
      const perDay = basic / 30;
      const lopAmount = Math.round(perDay * lopDays);
      const otherDeductions = Math.round(basic * 0.12) + 200;
      const netSalary = grossSalary - lopAmount - otherDeductions;

      payslipRows.push({
        institute_id: instId,
        run_id: run.run_id,
        staff_id: staffId,
        basic_salary: basic,
        allowances_total: allowancesTotal,
        gross_salary: grossSalary,
        lop_days: lopDays,
        lop_amount: lopAmount,
        other_deductions: otherDeductions,
        net_salary: netSalary,
      });
    }
    await prisma.payslip.createMany({ data: payslipRows, skipDuplicates: true });
  }

  console.log(
    `  (staff) seeded ${STAFF_COUNT} staff members, ${leaveTypeDefs.length} leave types, ${LEAVE_APPLICATION_COUNT} leave applications, ${payrollMonths.length} payroll runs`,
  );
}
