import type { PrismaClient } from '@prisma/client';

/**
 * Seeds ~6 months (2026-05-01 .. 2026-10-14) of realistic ADMISSION transactional
 * data for `instId`: an active academic session, programs, an enquiry → application
 * → test/interview → offer → fee payment → confirmation funnel, so the admission
 * dashboard (KPIs, funnel, seats, applications-by-status) and reports are populated.
 *
 * Safe to re-run: if the institute already has the seeded academic session, this
 * is a no-op.
 */
export async function seedAdmission(prisma: PrismaClient, instId: string): Promise<void> {
  const SESSION_NAME = '2026-27';
  const existing = await prisma.admissionAcademicSession.findFirst({
    where: { institute_id: instId, name: SESSION_NAME },
    select: { session_id: true },
  });
  if (existing) {
    console.log('  [admission] already seeded — skipping');
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
  const pad = (n: number, len = 5) => String(n).padStart(len, '0');

  let applicantSeq = 0;
  let applicationSeq = 0;
  let hallTicketSeq = 0;
  let receiptSeq = 0;
  let enrollmentSeq = 0;

  console.log('  [admission] seeding session & programs...');

  const session = await prisma.admissionAcademicSession.create({
    data: {
      institute_id: instId,
      name: SESSION_NAME,
      start_date: new Date('2026-04-01'),
      end_date: new Date('2027-03-31'),
      status: 'active',
      created_by: 'seed-script',
    },
  });

  const programDefs = [
    { name: 'Grade 6', level: 'Middle School', total_seats: 60, fee: '12000' },
    { name: 'Grade 9', level: 'High School', total_seats: 50, fee: '18000' },
    { name: 'Grade 11 Science', level: 'Senior Secondary', total_seats: 40, fee: '25000' },
  ];
  const programs: Array<Awaited<ReturnType<typeof prisma.admissionProgram.create>>> = [];
  for (const def of programDefs) {
    const program = await prisma.admissionProgram.create({
      data: {
        institute_id: instId,
        name: def.name,
        level: def.level,
        total_seats: def.total_seats,
        eligibility_criteria: 'Standard eligibility as per institute norms',
        created_by: 'seed-script',
      },
    });
    programs.push(program);
    await prisma.admissionFeeStructure.create({
      data: {
        institute_id: instId,
        program_id: program.program_id,
        session_id: session.session_id,
        amount: def.fee,
        due_date: new Date('2026-07-31'),
        created_by: 'seed-script',
      },
    });
  }
  const feeByProgram = new Map(programDefs.map((d, i) => [programs[i].program_id, d.fee]));

  // Entrance tests per program — mostly in the past, a couple scheduled after "today".
  console.log('  [admission] seeding entrance tests...');
  const testModes: Array<'online' | 'offline'> = ['online', 'offline'];
  const testsByProgram = new Map<number, Array<Awaited<ReturnType<typeof prisma.admissionEntranceTest.create>>>>();
  for (const program of programs) {
    const tests: Array<Awaited<ReturnType<typeof prisma.admissionEntranceTest.create>>> = [];
    const testDates = [
      randomDateBetween(WINDOW_START, addDays(TODAY, -60)),
      randomDateBetween(addDays(TODAY, -45), addDays(TODAY, -10)),
      addDays(TODAY, 10 + rand(15)), // upcoming
    ];
    for (const testDate of testDates) {
      const test = await prisma.admissionEntranceTest.create({
        data: {
          institute_id: instId,
          name: `${program.name} Entrance Test`,
          session_id: session.session_id,
          program_id: program.program_id,
          test_date: testDate,
          mode: pick(testModes),
          venue: 'Main Campus Hall',
          max_marks: '100',
          created_by: 'seed-script',
        },
      });
      tests.push(test);
    }
    testsByProgram.set(program.program_id, tests);
  }

  // ─── Enquiries ─────────────────────────────────────────────────────────
  console.log('  [admission] seeding enquiries...');
  const sources: Array<'walk_in' | 'website' | 'referral' | 'agent' | 'advertisement'> = [
    'walk_in',
    'website',
    'referral',
    'agent',
    'advertisement',
  ];
  const firstNames = ['Aarav', 'Diya', 'Ishaan', 'Myra', 'Vihaan', 'Kiara', 'Reyansh', 'Anika', 'Advik', 'Saanvi'];
  const lastNames = ['Sharma', 'Verma', 'Gupta', 'Reddy', 'Nair', 'Iyer', 'Menon', 'Patel', 'Singh', 'Das'];
  const nameFor = () => `${pick(firstNames)} ${pick(lastNames)}`;

  const NUM_ENQUIRIES = 180;
  type EnquiryRec = {
    enquiry_id: number;
    program_id: number;
    status: 'new' | 'contacted' | 'application_started' | 'converted' | 'lost';
    created_at: Date;
  };
  const enquiries: EnquiryRec[] = [];
  for (let i = 0; i < NUM_ENQUIRIES; i++) {
    applicantSeq++;
    const createdAt = randomDateBetween(WINDOW_START, TODAY);
    const roll = rand(100);
    const status: EnquiryRec['status'] =
      roll < 20 ? 'new' : roll < 45 ? 'contacted' : roll < 65 ? 'application_started' : roll < 90 ? 'converted' : 'lost';
    const program = pick(programs);
    const enquiry = await prisma.admissionEnquiry.create({
      data: {
        institute_id: instId,
        name: nameFor(),
        phone: `9${String(800000000 + applicantSeq).padStart(9, '0')}`,
        email: `enquiry${applicantSeq}@example.com`,
        program_id: program.program_id,
        source: pick(sources),
        status,
        assigned_to: 'counsellor-seed-1',
        created_by: 'seed-script',
        created_at: createdAt,
      },
    });

    // Followups for still-open enquiries; some due/overdue (next_followup_date <= today).
    if (status === 'new' || status === 'contacted' || status === 'application_started') {
      const followupDate = randomDateBetween(createdAt, TODAY);
      const nextFollowupDate =
        rand(100) < 50 ? addDays(TODAY, -rand(5)) : addDays(TODAY, 1 + rand(10));
      await prisma.admissionEnquiryFollowup.create({
        data: {
          enquiry_id: enquiry.enquiry_id,
          notes: 'Discussed program details and next steps with parent.',
          followup_date: dateOnly(followupDate),
          next_followup_date: dateOnly(nextFollowupDate),
          updated_by: 'counsellor-seed-1',
        },
      });
    }

    enquiries.push({ enquiry_id: enquiry.enquiry_id, program_id: program.program_id, status, created_at: createdAt });
  }

  // ─── Applications (from converted enquiries + direct walk-ins) ───────
  console.log('  [admission] seeding applications...');
  type AppStatus =
    | 'draft'
    | 'submitted'
    | 'under_review'
    | 'test_scheduled'
    | 'shortlisted'
    | 'waitlisted'
    | 'rejected'
    | 'offered'
    | 'admitted'
    | 'cancelled';
  const statusWeights: Array<[AppStatus, number]> = [
    ['draft', 5],
    ['submitted', 15],
    ['under_review', 15],
    ['test_scheduled', 10],
    ['shortlisted', 15],
    ['waitlisted', 5],
    ['rejected', 10],
    ['offered', 12],
    ['admitted', 11],
    ['cancelled', 2],
  ];
  const weightedStatus = (): AppStatus => {
    const total = statusWeights.reduce((s, [, w]) => s + w, 0);
    let roll = rand(total);
    for (const [status, w] of statusWeights) {
      if (roll < w) return status;
      roll -= w;
    }
    return 'submitted';
  };
  const assessedStatuses = new Set<AppStatus>([
    'test_scheduled',
    'shortlisted',
    'waitlisted',
    'rejected',
    'offered',
    'admitted',
  ]);
  const offerableStatuses = new Set<AppStatus>(['offered', 'admitted']);

  type ApplicationRec = {
    application_id: number;
    program_id: number;
    status: AppStatus;
    application_date: Date;
  };
  const applications: ApplicationRec[] = [];

  const convertedEnquiries = enquiries.filter((e) => e.status === 'converted');
  for (const enquiry of convertedEnquiries) {
    applicantSeq++;
    applicationSeq++;
    const applicant = await prisma.admissionApplicant.create({
      data: {
        institute_id: instId,
        name: nameFor(),
        gender: pick(['male', 'female', 'other'] as const),
        phone: `9${String(810000000 + applicantSeq).padStart(9, '0')}`,
        email: `applicant${applicantSeq}@example.com`,
        guardian_name: `${pick(lastNames)} Parent`,
        guardian_contact: `9${String(820000000 + applicantSeq).padStart(9, '0')}`,
        created_by: 'seed-script',
      },
    });
    const applicationDate = addDays(enquiry.created_at, 2 + rand(10));
    const status = weightedStatus();
    const application = await prisma.admissionApplication.create({
      data: {
        institute_id: instId,
        applicant_id: applicant.applicant_id,
        session_id: session.session_id,
        program_id: enquiry.program_id,
        application_number: `APP-2026-${pad(applicationSeq)}`,
        source_enquiry_id: enquiry.enquiry_id,
        application_date: dateOnly(applicationDate),
        status,
        created_by: 'seed-script',
      },
    });
    applications.push({
      application_id: application.application_id,
      program_id: enquiry.program_id,
      status,
      application_date: applicationDate,
    });
  }

  // Direct applications (no enquiry) to round out the funnel.
  const NUM_DIRECT_APPLICATIONS = 55;
  for (let i = 0; i < NUM_DIRECT_APPLICATIONS; i++) {
    applicantSeq++;
    applicationSeq++;
    const applicant = await prisma.admissionApplicant.create({
      data: {
        institute_id: instId,
        name: nameFor(),
        gender: pick(['male', 'female', 'other'] as const),
        phone: `9${String(830000000 + applicantSeq).padStart(9, '0')}`,
        email: `applicant${applicantSeq}@example.com`,
        guardian_name: `${pick(lastNames)} Parent`,
        guardian_contact: `9${String(840000000 + applicantSeq).padStart(9, '0')}`,
        created_by: 'seed-script',
      },
    });
    const program = pick(programs);
    const applicationDate = randomDateBetween(WINDOW_START, TODAY);
    const status = weightedStatus();
    const application = await prisma.admissionApplication.create({
      data: {
        institute_id: instId,
        applicant_id: applicant.applicant_id,
        session_id: session.session_id,
        program_id: program.program_id,
        application_number: `APP-2026-${pad(applicationSeq)}`,
        application_date: dateOnly(applicationDate),
        status,
        created_by: 'seed-script',
      },
    });
    applications.push({
      application_id: application.application_id,
      program_id: program.program_id,
      status,
      application_date: applicationDate,
    });
  }

  console.log(`  [admission] ${applications.length} applications created`);

  // ─── Test registrations / results, interviews, offers, payments, confirmations
  console.log('  [admission] seeding assessments, offers, payments & confirmations...');
  let futureInterviewsCreated = 0;
  for (const app of applications) {
    const isAssessed = assessedStatuses.has(app.status) || rand(100) < 40;

    if (isAssessed) {
      const tests = testsByProgram.get(app.program_id) ?? [];
      const pastTests = tests.filter((t) => t.test_date <= TODAY);
      if (pastTests.length > 0 && rand(100) < 70) {
        hallTicketSeq++;
        const test = pick(pastTests);
        await prisma.admissionTestRegistration.create({
          data: {
            application_id: app.application_id,
            test_id: test.test_id,
            hall_ticket_number: `HT-2026-${pad(hallTicketSeq)}`,
            status: 'appeared',
            registered_by: 'seed-script',
          },
        });
        await prisma.admissionTestResult.create({
          data: {
            application_id: app.application_id,
            test_id: test.test_id,
            marks_obtained: String(40 + rand(60)),
            rank: 1 + rand(200),
            recorded_by: 'seed-script',
          },
        });
      } else if (rand(100) < 25) {
        // Interview path instead of / in addition to a test.
        const wantsFuture =
          (app.status === 'test_scheduled' || app.status === 'shortlisted') && futureInterviewsCreated < 6;
        const scheduledDatetime = wantsFuture
          ? addDays(TODAY, 1 + rand(14))
          : randomDateBetween(WINDOW_START, addDays(TODAY, -1));
        if (wantsFuture) futureInterviewsCreated++;
        await prisma.admissionInterview.create({
          data: {
            application_id: app.application_id,
            scheduled_datetime: scheduledDatetime,
            mode: pick(['online', 'offline'] as const),
            venue_or_link: 'Admissions Office, Room 2',
            status: wantsFuture ? 'scheduled' : pick(['completed', 'no_show'] as const),
            created_by: 'seed-script',
          },
        });
      }
    }

    let offerStatus: 'offered' | 'accepted' | 'declined' | 'expired' | null = null;
    if (app.status === 'offered') offerStatus = 'offered';
    else if (app.status === 'admitted') offerStatus = 'accepted';
    else if (app.status === 'rejected' && rand(100) < 30) offerStatus = 'declined';
    else if (app.status === 'waitlisted' && rand(100) < 15) offerStatus = 'expired';

    if (offerStatus) {
      const offerDate = addDays(app.application_date, 10 + rand(20));
      const offer = await prisma.admissionOffer.create({
        data: {
          application_id: app.application_id,
          offer_date: offerDate,
          offer_expiry_date: addDays(offerDate, 14),
          status: offerStatus,
          seat_category: pick(['general', 'management', 'sibling_quota'] as const),
          issued_by: 'seed-script',
          responded_by: offerStatus !== 'offered' ? 'seed-script' : null,
          responded_at: offerStatus !== 'offered' ? addDays(offerDate, 2 + rand(5)) : null,
        },
      });

      if (offerStatus === 'accepted') {
        const feeAmount = feeByProgram.get(app.program_id) ?? '10000';
        const payFull = app.status === 'admitted';
        receiptSeq++;
        await prisma.admissionPayment.create({
          data: {
            application_id: app.application_id,
            amount_paid: payFull ? feeAmount : (Number(feeAmount) / 2).toFixed(2),
            payment_date: dateOnly(addDays(offer.offer_date, 3 + rand(5))),
            payment_mode: pick(['card', 'upi', 'bank_transfer', 'cash', 'online'] as const),
            receipt_number: `RCT-ADM-${pad(receiptSeq)}`,
            recorded_by: 'accounts-seed',
          },
        });
      }

      if (app.status === 'admitted' && rand(100) < 80) {
        enrollmentSeq++;
        await prisma.admissionConfirmation.create({
          data: {
            application_id: app.application_id,
            confirmed_date: addDays(offer.offer_date, 15 + rand(10)),
            enrollment_number: `ENR-2026-${pad(enrollmentSeq)}`,
            status: 'confirmed',
            confirmed_by: 'admissions-seed',
            student_link_status: rand(100) < 50 ? 'linked' : 'pending',
          },
        });
      }
    }
  }

  console.log('  [admission] done.');
}
