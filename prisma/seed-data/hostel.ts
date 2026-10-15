import type { PrismaClient } from '@prisma/client';

/**
 * Seeds ~6 months (2026-05-01 .. 2026-10-14) of realistic HOSTEL transactional
 * data for `instId` so the hostel dashboard (occupancy, gate status, attendance,
 * complaints, fees, mess) and the main dashboard's hostel summary are populated.
 *
 * Safe to re-run: if the institute already has hostel blocks seeded, this is a
 * no-op.
 */
export async function seedHostel(prisma: PrismaClient, instId: string): Promise<void> {
  const existing = await prisma.hostelBlock.findFirst({
    where: { institute_id: instId, name: 'Hostel Block A' },
    select: { block_id: true },
  });
  // Blocks/rooms/beds/residents/allotments/the per-resident gate-pass pass
  // are only ever created once; everything after them (live gate passes,
  // attendance, visitors, mess, complaints, fees) is safe to top up on a
  // resumed run, so a prior partial run (e.g. one that crashed mid-way)
  // picks up where it left off instead of either duplicating or no-op'ing.
  const alreadySeeded = !!existing;
  if (alreadySeeded) {
    console.log('  [hostel] blocks already seeded — resuming from gate passes onward...');
  }

  const TODAY = new Date('2026-10-14T00:00:00.000Z');
  const WINDOW_START = new Date('2026-05-01T00:00:00.000Z');

  const rand = (n: number) => Math.floor(Math.random() * n);
  const pick = <T>(arr: readonly T[]): T => arr[rand(arr.length)];
  const dateOnly = (d: Date) => new Date(d.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);
  const randomDateBetween = (start: Date, end: Date) =>
    new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  const pad = (n: number, len = 4) => String(n).padStart(len, '0');

  let residentSeq = 0;
  let passSeq = 0;
  let invoiceSeq = 0;
  let receiptSeq = 0;

  console.log('  [hostel] seeding blocks/rooms/beds...');

  // ─── Blocks ────────────────────────────────────────────────────────────
  const blockDefs = [
    { name: 'Hostel Block A', gender_type: 'boys' as const, warden_name: 'Mr. Ramesh Kumar' },
    { name: 'Hostel Block B', gender_type: 'girls' as const, warden_name: 'Mrs. Lakshmi Iyer' },
    { name: 'Hostel Block C', gender_type: 'mixed' as const, warden_name: 'Mr. Suresh Patel' },
  ];

  const roomTypeCycle: Array<{ room_type: 'single' | 'double' | 'triple' | 'dormitory'; capacity: number }> = [
    { room_type: 'single', capacity: 1 },
    { room_type: 'double', capacity: 2 },
    { room_type: 'triple', capacity: 3 },
    { room_type: 'dormitory', capacity: 6 },
  ];

  type RoomRec = { room_id: number; room_type: 'single' | 'double' | 'triple' | 'dormitory'; capacity: number; beds: number[] };
  type BlockRec = { block_id: number; gender_type: 'boys' | 'girls' | 'mixed'; rooms: RoomRec[] };

  const blocks: BlockRec[] = [];

  if (!alreadySeeded) for (const bDef of blockDefs) {
    const block = await prisma.hostelBlock.create({
      data: {
        institute_id: instId,
        name: bDef.name,
        gender_type: bDef.gender_type,
        total_floors: 2,
        warden_name: bDef.warden_name,
        description: `${bDef.name} — seeded demo block`,
        is_active: true,
        created_by: 'seed-script',
      },
    });

    const rooms: RoomRec[] = [];
    let roomCounter = 0;
    for (let floor = 1; floor <= 2; floor++) {
      for (let i = 0; i < 4; i++) {
        roomCounter++;
        const typeDef = roomTypeCycle[((floor - 1) * 4 + i) % roomTypeCycle.length];
        const room = await prisma.hostelRoom.create({
          data: {
            institute_id: instId,
            block_id: block.block_id,
            room_number: `${floor}${String(roomCounter).padStart(2, '0')}`,
            floor,
            room_type: typeDef.room_type,
            capacity: typeDef.capacity,
            status: 'available',
            created_by: 'seed-script',
          },
        });

        const bedIds: number[] = [];
        for (let b = 1; b <= typeDef.capacity; b++) {
          const bed = await prisma.hostelBed.create({
            data: {
              institute_id: instId,
              room_id: room.room_id,
              bed_number: `B${b}`,
              status: 'vacant',
              created_by: 'seed-script',
            },
          });
          bedIds.push(bed.bed_id);
        }

        rooms.push({ room_id: room.room_id, room_type: typeDef.room_type, capacity: typeDef.capacity, beds: bedIds });
      }
    }

    blocks.push({ block_id: block.block_id, gender_type: bDef.gender_type, rooms });
  }

  if (alreadySeeded) {
    const dbBlocks = await prisma.hostelBlock.findMany({
      where: { institute_id: instId },
      include: { rooms: { include: { beds: true } } },
    });
    for (const b of dbBlocks) {
      blocks.push({
        block_id: b.block_id,
        gender_type: b.gender_type as 'boys' | 'girls' | 'mixed',
        rooms: b.rooms.map((r) => ({
          room_id: r.room_id,
          room_type: r.room_type as 'single' | 'double' | 'triple' | 'dormitory',
          capacity: r.capacity,
          beds: r.beds.map((bd) => bd.bed_id),
        })),
      });
    }
  }

  console.log('  [hostel] seeding residents & allotments...');

  type ResidentRec = { resident_id: number; gender: 'male' | 'female' | 'other'; admitted_on: Date };
  const activeResidents: ResidentRec[] = [];
  const firstNamesMale = ['Arjun', 'Rohan', 'Vikram', 'Aditya', 'Karan', 'Siddharth', 'Rahul', 'Nikhil', 'Varun', 'Aman'];
  const firstNamesFemale = ['Ananya', 'Priya', 'Sneha', 'Divya', 'Kavya', 'Riya', 'Pooja', 'Neha', 'Shreya', 'Isha'];
  const lastNames = ['Sharma', 'Verma', 'Gupta', 'Reddy', 'Nair', 'Iyer', 'Menon', 'Patel', 'Singh', 'Das'];
  const grades = ['6', '7', '8', '9', '10', '11', '12'];

  const genderFor = (blockGender: 'boys' | 'girls' | 'mixed'): 'male' | 'female' | 'other' => {
    if (blockGender === 'boys') return 'male';
    if (blockGender === 'girls') return 'female';
    return pick(['male', 'female', 'other'] as const);
  };

  const nameFor = (gender: 'male' | 'female' | 'other') => {
    const first = gender === 'female' ? pick(firstNamesFemale) : pick(firstNamesMale);
    return `${first} ${pick(lastNames)}`;
  };

  if (!alreadySeeded) for (const block of blocks) {
    for (const room of block.rooms) {
      const fillCount = Math.max(1, Math.floor(room.capacity * 0.7));
      for (let i = 0; i < fillCount; i++) {
        residentSeq++;
        const gender = genderFor(block.gender_type);
        const admittedOn = dateOnly(randomDateBetween(WINDOW_START, addDays(TODAY, -30)));
        const resident = await prisma.hostelResident.create({
          data: {
            institute_id: instId,
            student_ref: `STU-HSTL-${pad(residentSeq)}`,
            admission_no: `HSTL-${pad(residentSeq)}`,
            student_name: nameFor(gender),
            gender,
            grade: pick(grades),
            guardian_name: `${pick(lastNames)} Family Guardian`,
            guardian_phone: `9${String(700000000 + residentSeq).padStart(9, '0')}`,
            guardian_email: `guardian${residentSeq}@example.com`,
            status: 'active',
            admitted_on: admittedOn,
            created_by: 'seed-script',
          },
        });

        const bedId = room.beds[i];
        await prisma.hostelRoomAllotment.create({
          data: {
            institute_id: instId,
            resident_id: resident.resident_id,
            room_id: room.room_id,
            bed_id: bedId,
            academic_year: '2026-27',
            allotment_date: admittedOn,
            status: 'active',
            allotted_by: 'seed-script',
          },
        });
        await prisma.hostelBed.update({ where: { bed_id: bedId }, data: { status: 'occupied' } });

        activeResidents.push({ resident_id: resident.resident_id, gender, admitted_on: admittedOn });
      }
    }
  }

  // A few suspended residents (still counted, status differs for occupancy KPI variety)
  if (!alreadySeeded) for (let i = 0; i < Math.min(3, activeResidents.length); i++) {
    const r = activeResidents[rand(activeResidents.length)];
    await prisma.hostelResident.update({
      where: { resident_id: r.resident_id },
      data: { status: 'suspended', status_reason: 'Disciplinary review in progress' },
    });
  }

  // A handful of historical vacated residents (left before today), on beds that
  // are currently empty (never allocated above), so bed state stays consistent.
  const vacatedResidents: ResidentRec[] = [];
  if (!alreadySeeded) for (const block of blocks) {
    for (const room of block.rooms) {
      const fillCount = Math.max(1, Math.floor(room.capacity * 0.7));
      if (fillCount >= room.capacity) continue; // no spare bed in this room
      residentSeq++;
      const gender = genderFor(block.gender_type);
      const admittedOn = dateOnly(randomDateBetween(WINDOW_START, addDays(TODAY, -90)));
      const vacatedOn = dateOnly(randomDateBetween(addDays(admittedOn, 15), addDays(TODAY, -5)));
      const resident = await prisma.hostelResident.create({
        data: {
          institute_id: instId,
          student_ref: `STU-HSTL-${pad(residentSeq)}`,
          admission_no: `HSTL-${pad(residentSeq)}`,
          student_name: nameFor(gender),
          gender,
          grade: pick(grades),
          guardian_name: `${pick(lastNames)} Family Guardian`,
          guardian_phone: `9${String(700000000 + residentSeq).padStart(9, '0')}`,
          status: 'vacated',
          admitted_on: admittedOn,
          vacated_on: vacatedOn,
          status_reason: 'Transferred out of hostel',
          created_by: 'seed-script',
        },
      });
      const bedId = room.beds[fillCount]; // one of the never-filled beds
      await prisma.hostelRoomAllotment.create({
        data: {
          institute_id: instId,
          resident_id: resident.resident_id,
          room_id: room.room_id,
          bed_id: bedId,
          academic_year: '2026-27',
          allotment_date: admittedOn,
          vacate_date: vacatedOn,
          status: 'vacated',
          allotted_by: 'seed-script',
          closed_by: 'seed-script',
          close_reason: 'Transferred out',
        },
      });
      vacatedResidents.push({ resident_id: resident.resident_id, gender, admitted_on: admittedOn });
      if (vacatedResidents.length >= 8) break;
    }
    if (vacatedResidents.length >= 8) break;
  }

  if (alreadySeeded) {
    const dbResidents = await prisma.hostelResident.findMany({ where: { institute_id: instId } });
    for (const r of dbResidents) {
      const rec: ResidentRec = {
        resident_id: r.resident_id,
        gender: r.gender as 'male' | 'female' | 'other',
        admitted_on: r.admitted_on,
      };
      if (r.status === 'vacated') vacatedResidents.push(rec);
      else activeResidents.push(rec); // includes 'active' and 'suspended', as the original array did
    }
  }

  console.log(`  [hostel] ${activeResidents.length} active residents, ${vacatedResidents.length} vacated residents`);

  // ─── Gate passes ──────────────────────────────────────────────────────
  console.log('  [hostel] seeding gate passes...');
  // passSeq must continue past any gate passes a prior partial run already created.
  passSeq = alreadySeeded ? await prisma.hostelGatePass.count({ where: { institute_id: instId } }) : 0;
  const passTypes: Array<'day_outing' | 'weekend_leave' | 'home_leave' | 'medical'> = [
    'day_outing',
    'weekend_leave',
    'home_leave',
    'medical',
  ];
  const destinations = ['Local market', 'Family home', 'Hospital visit', 'Railway station', 'Relative\'s house'];

  if (!alreadySeeded) for (const resident of activeResidents) {
    const numPasses = rand(4); // 0-3 gate passes per resident across the window
    for (let i = 0; i < numPasses; i++) {
      passSeq++;
      const requestedOutAt = randomDateBetween(WINDOW_START, addDays(TODAY, -1));
      const expectedReturnAt = addDays(requestedOutAt, 1 + rand(3));
      const statusRoll = rand(100);
      let status: 'pending' | 'approved' | 'rejected' | 'out' | 'returned' | 'overdue' | 'expired' | 'cancelled';
      let actualOutAt: Date | null = null;
      let actualReturnAt: Date | null = null;
      let approvedBy: string | null = null;
      let rejectedBy: string | null = null;

      if (statusRoll < 55) {
        status = 'returned';
        approvedBy = 'warden-seed';
        actualOutAt = requestedOutAt;
        actualReturnAt = addDays(requestedOutAt, rand(2));
      } else if (statusRoll < 65) {
        status = 'rejected';
        rejectedBy = 'warden-seed';
      } else if (statusRoll < 75) {
        status = 'cancelled';
      } else if (statusRoll < 85) {
        status = 'expired';
        approvedBy = 'warden-seed';
      } else {
        status = 'returned';
        approvedBy = 'warden-seed';
        actualOutAt = requestedOutAt;
        actualReturnAt = addDays(requestedOutAt, rand(2));
      }

      await prisma.hostelGatePass.create({
        data: {
          institute_id: instId,
          pass_no: `GP/2026/${pad(passSeq, 5)}`,
          resident_id: resident.resident_id,
          pass_type: pick(passTypes),
          reason: 'Scheduled outing',
          destination: pick(destinations),
          requested_out_at: requestedOutAt,
          expected_return_at: expectedReturnAt,
          actual_out_at: actualOutAt,
          actual_return_at: actualReturnAt,
          status,
          requested_by: 'seed-script',
          approved_by: approvedBy,
          rejected_by: rejectedBy,
          decided_at: approvedBy || rejectedBy ? requestedOutAt : null,
        },
      });
    }
  }

  // A few "live today" gate passes so the dashboard's gate-status KPIs are non-zero.
  // A resident may only hold one open pass at a time (DB constraint), so on a
  // resumed run skip anyone who already has an open pass from a prior attempt.
  const liveSample = activeResidents.slice(0, Math.min(8, activeResidents.length));
  const residentsWithOpenPass = new Set(
    (
      await prisma.hostelGatePass.findMany({
        where: {
          institute_id: instId,
          resident_id: { in: liveSample.map((r) => r.resident_id) },
          status: { in: ['pending', 'approved', 'out', 'overdue'] },
        },
        select: { resident_id: true },
      })
    ).map((r) => r.resident_id),
  );
  for (let i = 0; i < liveSample.length; i++) {
    const resident = liveSample[i];
    if (residentsWithOpenPass.has(resident.resident_id)) continue;
    passSeq++;
    let status: 'approved' | 'out' | 'overdue' | 'pending';
    let actualOutAt: Date | null = null;
    let requestedOutAt: Date;
    let expectedReturnAt: Date;
    if (i < 2) {
      status = 'pending';
      requestedOutAt = new Date(TODAY.getTime() + 2 * 3600000);
      expectedReturnAt = new Date(TODAY.getTime() + 8 * 3600000);
    } else if (i < 4) {
      status = 'approved';
      requestedOutAt = new Date(TODAY.getTime() + 2 * 3600000);
      expectedReturnAt = new Date(TODAY.getTime() + 10 * 3600000);
    } else if (i < 6) {
      status = 'out';
      requestedOutAt = new Date(TODAY.getTime() + 2 * 3600000);
      actualOutAt = new Date(TODAY.getTime() + 3 * 3600000);
      expectedReturnAt = new Date(TODAY.getTime() + 12 * 3600000);
    } else {
      // Went out yesterday, expected back yesterday evening, still not scanned in.
      status = 'overdue';
      requestedOutAt = addDays(TODAY, -1);
      actualOutAt = addDays(TODAY, -1);
      expectedReturnAt = new Date(addDays(TODAY, -1).getTime() + 8 * 3600000);
    }
    await prisma.hostelGatePass.create({
      data: {
        institute_id: instId,
        pass_no: `GP/2026/${pad(passSeq, 5)}`,
        resident_id: resident.resident_id,
        pass_type: pick(passTypes),
        reason: 'Weekend outing',
        destination: pick(destinations),
        requested_out_at: requestedOutAt,
        expected_return_at: expectedReturnAt,
        actual_out_at: actualOutAt,
        status,
        requested_by: 'seed-script',
        approved_by: status === 'approved' || status === 'out' || status === 'overdue' ? 'warden-seed' : null,
        decided_at: status !== 'pending' ? requestedOutAt : null,
        overdue_at: status === 'overdue' ? addDays(TODAY, -1) : null,
      },
    });
  }

  // ─── Attendance (last 14 days, both sessions) ────────────────────────
  console.log('  [hostel] seeding attendance...');
  const ATTENDANCE_DAYS = 14;
  const existingAttendance = await prisma.hostelAttendance.count({ where: { institute_id: instId } });
  if (existingAttendance === 0) for (let d = 0; d < ATTENDANCE_DAYS; d++) {
    const day = dateOnly(addDays(TODAY, -d));
    for (const resident of activeResidents) {
      for (const session of ['morning', 'night'] as const) {
        const roll = rand(100);
        const status: 'present' | 'absent' | 'on_leave' = roll < 85 ? 'present' : roll < 95 ? 'on_leave' : 'absent';
        await prisma.hostelAttendance.create({
          data: {
            institute_id: instId,
            resident_id: resident.resident_id,
            attendance_date: day,
            session,
            status,
            marked_by: 'warden-seed',
          },
        });
      }
    }
  }

  // ─── Visitor logs ─────────────────────────────────────────────────────
  console.log('  [hostel] seeding visitor logs...');
  const visitorRelations = ['Father', 'Mother', 'Uncle', 'Aunt', 'Grandparent', 'Sibling'];
  const existingVisitorLogs = await prisma.hostelVisitorLog.count({ where: { institute_id: instId } });
  if (existingVisitorLogs === 0) for (const resident of activeResidents) {
    const numVisits = rand(3);
    for (let i = 0; i < numVisits; i++) {
      const inTime = randomDateBetween(WINDOW_START, addDays(TODAY, -1));
      const hasLeft = Math.random() < 0.9;
      await prisma.hostelVisitorLog.create({
        data: {
          institute_id: instId,
          resident_id: resident.resident_id,
          visitor_name: `${pick(lastNames)} ${pick(visitorRelations)}`,
          relation: pick(visitorRelations),
          purpose: 'Family visit',
          id_proof_type: 'Aadhaar',
          id_proof_masked: `XXXX-${pad(rand(9999), 4)}`,
          in_time: inTime,
          out_time: hasLeft ? addDays(inTime, 0) : null,
          recorded_by: 'seed-script',
          checked_out_by: hasLeft ? 'seed-script' : null,
        },
      });
    }
  }

  // ─── Mess menu + mess attendance ─────────────────────────────────────
  console.log('  [hostel] seeding mess menu & attendance...');
  const daysOfWeek: Array<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'> = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  const mealTypes: Array<'breakfast' | 'lunch' | 'snacks' | 'dinner'> = ['breakfast', 'lunch', 'snacks', 'dinner'];
  const menuItems: Record<string, string[]> = {
    breakfast: ['Idli', 'Sambar', 'Chutney', 'Tea'],
    lunch: ['Rice', 'Dal', 'Vegetable Curry', 'Curd'],
    snacks: ['Samosa', 'Tea', 'Biscuits'],
    dinner: ['Chapati', 'Paneer Curry', 'Rice', 'Salad'],
  };
  const menuEffectiveFrom = dateOnly(WINDOW_START);
  for (const day of daysOfWeek) {
    for (const meal of mealTypes) {
      await prisma.hostelMessMenu.upsert({
        where: {
          institute_id_day_of_week_meal_type_effective_from: {
            institute_id: instId,
            day_of_week: day,
            meal_type: meal,
            effective_from: menuEffectiveFrom,
          },
        },
        update: {},
        create: {
          institute_id: instId,
          day_of_week: day,
          meal_type: meal,
          items: menuItems[meal],
          effective_from: menuEffectiveFrom,
          is_active: true,
          created_by: 'seed-script',
        },
      });
    }
  }

  const MESS_ATTENDANCE_DAYS = 7;
  const existingMessAttendance = await prisma.hostelMessAttendance.count({ where: { institute_id: instId } });
  if (existingMessAttendance === 0) for (let d = 0; d < MESS_ATTENDANCE_DAYS; d++) {
    const day = dateOnly(addDays(TODAY, -d));
    for (const resident of activeResidents) {
      for (const meal of mealTypes) {
        const roll = rand(100);
        const status: 'opted_in' | 'opted_out' | 'consumed' | 'missed' =
          roll < 15 ? 'opted_out' : roll < 75 ? 'consumed' : roll < 95 ? 'opted_in' : 'missed';
        await prisma.hostelMessAttendance.create({
          data: {
            institute_id: instId,
            resident_id: resident.resident_id,
            meal_date: day,
            meal_type: meal,
            status,
            marked_by: 'mess-staff-seed',
          },
        });
      }
    }
  }

  // ─── Complaints ────────────────────────────────────────────────────────
  console.log('  [hostel] seeding complaints...');
  const complaintCategories: Array<'electrical' | 'plumbing' | 'furniture' | 'cleanliness' | 'internet' | 'other'> = [
    'electrical',
    'plumbing',
    'furniture',
    'cleanliness',
    'internet',
    'other',
  ];
  const complaintPriorities: Array<'low' | 'medium' | 'high' | 'urgent'> = ['low', 'medium', 'high', 'urgent'];
  const NUM_COMPLAINTS = 30;
  const allRooms = blocks.flatMap((b) => b.rooms);
  const existingComplaints = await prisma.hostelComplaint.count({ where: { institute_id: instId } });
  if (existingComplaints === 0) for (let i = 0; i < NUM_COMPLAINTS; i++) {
    const createdAt = randomDateBetween(WINDOW_START, TODAY);
    const statusRoll = rand(100);
    const status: 'open' | 'in_progress' | 'resolved' | 'closed' =
      statusRoll < 20 ? 'open' : statusRoll < 35 ? 'in_progress' : statusRoll < 75 ? 'resolved' : 'closed';
    const resident = pick(activeResidents);
    const room = pick(allRooms);
    const resolvedAt = status === 'resolved' || status === 'closed' ? addDays(createdAt, 1 + rand(4)) : null;
    const closedAt = status === 'closed' ? addDays(resolvedAt ?? createdAt, 1) : null;

    const complaint = await prisma.hostelComplaint.create({
      data: {
        institute_id: instId,
        resident_id: resident.resident_id,
        room_id: room.room_id,
        category: pick(complaintCategories),
        description: 'Reported maintenance issue requiring attention',
        priority: pick(complaintPriorities),
        status,
        assigned_to: status === 'open' ? null : 'staff-seed-1',
        assigned_to_name: status === 'open' ? null : 'Maintenance Staff',
        resolution_notes: resolvedAt ? 'Issue resolved by maintenance team' : null,
        created_by: 'seed-script',
        created_at: createdAt,
        resolved_at: resolvedAt,
        closed_at: closedAt,
      },
    });

    if (resolvedAt) {
      await prisma.hostelComplaintUpdate.create({
        data: {
          complaint_id: complaint.complaint_id,
          notes: 'Technician assigned and issue fixed.',
          status_change: 'resolved',
          updated_by: 'staff-seed-1',
          updated_at: resolvedAt,
        },
      });
    }
  }

  // ─── Fee plans, invoices, payments ────────────────────────────────────
  console.log('  [hostel] seeding fee plans, invoices & payments...');
  const feePlanDefs: Array<{
    name: string;
    room_type: 'single' | 'double' | 'triple' | 'dormitory';
    includes_mess: boolean;
    amount: string;
  }> = [
    { name: 'Single Room (with Mess)', room_type: 'single', includes_mess: true, amount: '15000' },
    { name: 'Double Room (with Mess)', room_type: 'double', includes_mess: true, amount: '11000' },
    { name: 'Triple Room (with Mess)', room_type: 'triple', includes_mess: true, amount: '8500' },
    { name: 'Dormitory (with Mess)', room_type: 'dormitory', includes_mess: true, amount: '6000' },
  ];
  type FeePlanRec = { fee_plan_id: number; room_type: 'single' | 'double' | 'triple' | 'dormitory'; includes_mess: boolean; billing_cycle: 'monthly' | 'quarterly' | 'annual'; name: string; amount: string };
  const feePlans: FeePlanRec[] = [];
  const existingFeePlans = await prisma.hostelFeePlan.findMany({ where: { institute_id: instId } });
  if (existingFeePlans.length === 0) {
    for (const def of feePlanDefs) {
      const plan = await prisma.hostelFeePlan.create({
        data: {
          institute_id: instId,
          name: def.name,
          room_type: def.room_type,
          includes_mess: def.includes_mess,
          amount: def.amount,
          billing_cycle: 'monthly',
          is_active: true,
          created_by: 'seed-script',
        },
      });
      feePlans.push({ ...plan, amount: plan.amount.toString() });
    }
  } else {
    for (const p of existingFeePlans) feePlans.push({ ...p, amount: p.amount.toString() });
  }
  const planByRoomType = new Map(feePlans.map((p) => [p.room_type, p]));

  // Determine each active resident's current room_type via their active allotment
  // (re-derived from the DB so it's correct regardless of push order above).
  const roomTypeByResident = new Map<number, 'single' | 'double' | 'triple' | 'dormitory'>();
  const allotmentsForFees = await prisma.hostelRoomAllotment.findMany({
    where: { institute_id: instId, status: 'active' },
    select: { resident_id: true, room: { select: { room_type: true } } },
  });
  for (const a of allotmentsForFees) {
    roomTypeByResident.set(a.resident_id, a.room.room_type);
  }

  const monthPeriods = [
    { label: '2026-05', start: '2026-05-01', end: '2026-05-31', due: '2026-05-10' },
    { label: '2026-06', start: '2026-06-01', end: '2026-06-30', due: '2026-06-10' },
    { label: '2026-07', start: '2026-07-01', end: '2026-07-31', due: '2026-07-10' },
    { label: '2026-08', start: '2026-08-01', end: '2026-08-31', due: '2026-08-10' },
    { label: '2026-09', start: '2026-09-01', end: '2026-09-30', due: '2026-09-10' },
    { label: '2026-10', start: '2026-10-01', end: '2026-10-14', due: '2026-10-10' },
  ];

  const existingInvoices = await prisma.hostelFeeInvoice.count({ where: { institute_id: instId } });
  if (existingInvoices === 0) for (const resident of activeResidents) {
    const roomType = roomTypeByResident.get(resident.resident_id) ?? 'single';
    const plan = planByRoomType.get(roomType)!;
    for (const period of monthPeriods) {
      const periodStart = new Date(period.start);
      if (periodStart < dateOnly(resident.admitted_on)) continue; // not resident yet that month

      invoiceSeq++;
      const dueDate = new Date(period.due);
      const roll = rand(100);
      let paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
      let amountPaid = '0';
      if (roll < 55) {
        paymentStatus = 'paid';
        amountPaid = plan.amount.toString();
      } else if (roll < 75) {
        paymentStatus = 'partially_paid';
        amountPaid = (Number(plan.amount) / 2).toFixed(2);
      } else {
        paymentStatus = 'unpaid';
      }

      const invoice = await prisma.hostelFeeInvoice.create({
        data: {
          institute_id: instId,
          invoice_no: `INV/HSTL/${pad(invoiceSeq, 5)}`,
          resident_id: resident.resident_id,
          fee_plan_id: plan.fee_plan_id,
          plan_name: plan.name,
          room_type: plan.room_type,
          includes_mess: plan.includes_mess,
          billing_cycle: plan.billing_cycle,
          billing_period: period.label,
          period_start: new Date(period.start),
          period_end: new Date(period.end),
          amount_due: plan.amount.toString(),
          amount_paid: amountPaid,
          payment_status: paymentStatus,
          issued_on: new Date(period.start),
          due_date: dueDate,
          created_by: 'seed-script',
        },
      });

      if (paymentStatus !== 'unpaid') {
        receiptSeq++;
        await prisma.hostelFeePayment.create({
          data: {
            institute_id: instId,
            receipt_no: `RCT/HSTL/${pad(receiptSeq, 5)}`,
            invoice_id: invoice.invoice_id,
            resident_id: resident.resident_id,
            amount_paid: amountPaid,
            payment_date: addDays(new Date(period.start), 2 + rand(5)),
            payment_mode: pick(['cash', 'card', 'upi', 'bank_transfer'] as const),
            received_by: 'accounts-seed',
          },
        });
      }
    }
  }

  console.log('  [hostel] done.');
}
