import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Transactional demo data for the Alumni module, so its own dashboard
 * (directory / events / jobs / donations) and the main ERP dashboard's
 * alumni tile show real trends instead of zeros.
 *
 * "Today" for the institute is 2026-10-14; all dates below are anchored to
 * that fixed point (not the real system clock) so "upcoming" vs "past"
 * records land where the dashboards expect them, spanning roughly the last
 * 6 months (May 2026 - Oct 2026).
 *
 * Safe to re-run: guarded by an early-return once enough alumni profiles
 * already exist for this institute.
 */

const TODAY = new Date('2026-10-14T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const SEED_ACTOR = 'seed-script@eddva.com';

const MIN_ALUMNI_PROFILES = 50;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Random date between `from` and `to` (inclusive), both as Date instances. */
function randomDateBetween(from: Date, to: Date): Date {
  const t = randInt(from.getTime(), to.getTime());
  return new Date(t);
}

const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan',
  'Krishna', 'Ishaan', 'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Kiara', 'Myra',
  'Riya', 'Priya', 'Neha', 'Pooja', 'Rahul', 'Rohan', 'Karan', 'Varun',
  'Sanya', 'Tanvi', 'Isha', 'Meera', 'Nikhil', 'Siddharth',
];
const LAST_NAMES = [
  'Sharma', 'Verma', 'Gupta', 'Iyer', 'Nair', 'Reddy', 'Rao', 'Patel',
  'Mehta', 'Joshi', 'Kulkarni', 'Pillai', 'Chopra', 'Malhotra', 'Bose',
  'Banerjee', 'Desai', 'Kapoor', 'Agarwal', 'Singh',
];
const PROGRAMS = ['B.Tech CSE', 'B.Tech ECE', 'B.Com', 'BBA', 'B.Sc Physics', 'MBA', 'M.Tech CSE'];
const INDUSTRIES = ['Information Technology', 'Finance', 'Education', 'Healthcare', 'Manufacturing', 'Consulting', 'E-commerce'];
const COMPANIES = ['Infosys', 'TCS', 'Wipro', 'HDFC Bank', 'Accenture', 'Deloitte', 'Capgemini', 'Amazon', 'Flipkart', 'Startup Labs'];
const CITIES: Array<[string, string]> = [
  ['India', 'Bengaluru'], ['India', 'Hyderabad'], ['India', 'Pune'], ['India', 'Chennai'],
  ['India', 'Mumbai'], ['India', 'Delhi'], ['USA', 'San Francisco'], ['UAE', 'Dubai'],
];

export async function seedAlumni(prisma: PrismaClient, instId: string): Promise<void> {
  const existing = await prisma.alumniProfile.count({ where: { institute_id: instId } });
  const alreadySeeded = existing >= MIN_ALUMNI_PROFILES;
  if (alreadySeeded) {
    console.log(`  (alumni) already has ${existing} profiles — resuming from jobs/campaigns onward...`);
  }

  // ---- Alumni profiles --------------------------------------------------
  const PROFILE_COUNT = 60;
  const profileIds: number[] = [];
  if (alreadySeeded) {
    const rows = await prisma.alumniProfile.findMany({ where: { institute_id: instId }, select: { alumni_id: true } });
    profileIds.push(...rows.map((r) => r.alumni_id));
  }
  if (!alreadySeeded) for (let i = 1; i <= PROFILE_COUNT; i++) {
    const batchYear = randInt(2012, 2023);
    const [country, city] = pick(CITIES);
    // ~25% registered in the last 6 months (so "registered_last_30_days"
    // and the overall registration trend have recent activity); the rest
    // registered earlier, spread across prior years.
    const registeredAt =
      i % 4 === 0
        ? randomDateBetween(addDays(TODAY, -180), TODAY)
        : randomDateBetween(new Date('2020-01-01T00:00:00.000Z'), addDays(TODAY, -181));
    const verificationRoll = randInt(1, 100);
    const verificationStatus =
      verificationRoll <= 70 ? 'verified' : verificationRoll <= 90 ? 'pending' : 'rejected';

    const profile = await prisma.alumniProfile.create({
      data: {
        institute_id: instId,
        full_name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        batch_year: batchYear,
        graduation_year: batchYear,
        program: pick(PROGRAMS),
        email: `alumni.seed.${i}@inst-demo-alumni.test`,
        phone: `9${randInt(100000000, 999999999)}`,
        current_company: pick(COMPANIES),
        current_designation: pick(['Software Engineer', 'Senior Analyst', 'Manager', 'Consultant', 'Team Lead', 'Associate']),
        industry: pick(INDUSTRIES),
        city,
        country,
        verification_status: verificationStatus as any,
        verification_requested_at: verificationStatus === 'pending' ? registeredAt : null,
        verified_at: verificationStatus === 'verified' ? addDays(registeredAt, randInt(1, 10)) : null,
        verified_by: verificationStatus === 'verified' ? SEED_ACTOR : null,
        visibility: 'alumni_only',
        contact_visible: i % 3 === 0,
        source: i % 5 === 0 ? 'self_registered' : 'staff_created',
        is_active: !(i % 17 === 0),
        registered_at: registeredAt,
        created_by: SEED_ACTOR,
      },
    });
    profileIds.push(profile.alumni_id);
  }

  // ---- Events -------------------------------------------------------------
  const eventDefs = [
    { title: 'Alumni Meet 2026 - Bengaluru Chapter', type: 'reunion', offsetDays: -150, paid: false },
    { title: 'Tech Talks: Careers in AI', type: 'webinar', offsetDays: -120, paid: false },
    { title: 'Spring Networking Mixer', type: 'networking', offsetDays: -95, paid: true },
    { title: 'Annual Fund Gala Dinner', type: 'fundraiser', offsetDays: -70, paid: true },
    { title: 'Batch of 2016 Reunion', type: 'reunion', offsetDays: -55, paid: false },
    { title: 'Resume & LinkedIn Workshop', type: 'webinar', offsetDays: -30, paid: false },
    { title: 'Monsoon Networking Evening', type: 'networking', offsetDays: -10, paid: true },
    { title: 'Diwali Alumni Get-Together', type: 'reunion', offsetDays: 5, paid: false },
    { title: 'Startup Founders Panel', type: 'webinar', offsetDays: 14, paid: false },
    { title: 'Annual Homecoming Weekend', type: 'reunion', offsetDays: 25, paid: true },
    { title: 'Winter Charity Fundraiser', type: 'fundraiser', offsetDays: 40, paid: true },
    { title: 'New Year Networking Night', type: 'networking', offsetDays: 70, paid: false },
  ] as const;

  let txnSeq = 1;
  if (!alreadySeeded) for (const def of eventDefs) {
    const eventDate = addDays(TODAY, def.offsetDays);
    const isPast = def.offsetDays < 0;
    const event = await prisma.alumniEvent.create({
      data: {
        institute_id: instId,
        title: def.title,
        description: `${def.title} — organized by the Alumni Relations Office.`,
        event_type: def.type as any,
        mode: pick(['online', 'offline', 'hybrid']) as any,
        venue: def.type === 'webinar' ? null : 'Main Campus Auditorium',
        online_link: def.type === 'webinar' ? 'https://meet.eddva.test/alumni-webinar' : null,
        event_date: eventDate,
        max_capacity: def.type === 'webinar' ? null : randInt(80, 200),
        is_paid: def.paid,
        ticket_price: def.paid ? randInt(200, 1500) : null,
        status: isPast ? 'completed' : 'upcoming',
        created_by: SEED_ACTOR,
      },
    });

    const attendees = shuffle(profileIds).slice(0, randInt(15, 35));
    for (const alumniId of attendees) {
      let attendanceStatus: string;
      if (isPast) {
        const r = randInt(1, 100);
        attendanceStatus = r <= 70 ? 'attended' : r <= 90 ? 'no_show' : 'cancelled';
      } else {
        attendanceStatus = randInt(1, 100) <= 90 ? 'registered' : 'cancelled';
      }
      const paymentStatus = !def.paid
        ? 'not_applicable'
        : attendanceStatus === 'cancelled'
          ? 'pending'
          : randInt(1, 100) <= 85
            ? 'paid'
            : 'pending';

      const registration = await prisma.alumniEventRegistration.create({
        data: {
          institute_id: instId,
          event_id: event.event_id,
          alumni_id: alumniId,
          registered_at: addDays(eventDate, -randInt(3, 30)),
          attendance_status: attendanceStatus as any,
          payment_status: paymentStatus as any,
          amount_due: def.paid ? event.ticket_price : null,
          registered_by: SEED_ACTOR,
          attendance_marked_at: isPast && attendanceStatus !== 'cancelled' ? eventDate : null,
          attendance_marked_by: isPast && attendanceStatus !== 'cancelled' ? SEED_ACTOR : null,
        },
      });

      if (def.paid && paymentStatus === 'paid') {
        await prisma.alumniEventPayment.create({
          data: {
            institute_id: instId,
            registration_id: registration.registration_id,
            amount: event.ticket_price ?? 0,
            payment_mode: pick(['card', 'upi', 'bank_transfer']) as any,
            transaction_ref: `EVT-TXN-${instId}-${txnSeq++}`,
            paid_at: addDays(eventDate, -randInt(0, 10)),
            recorded_by: SEED_ACTOR,
          },
        });
      }
    }
  }

  // ---- Jobs ---------------------------------------------------------------
  const jobTitles = [
    'Software Engineer', 'Data Analyst', 'Product Manager', 'Business Development Associate',
    'HR Executive', 'Marketing Intern', 'Backend Developer', 'UI/UX Designer',
    'Financial Analyst', 'Operations Associate', 'QA Engineer', 'Sales Executive',
    'DevOps Engineer', 'Content Strategist', 'Research Associate', 'Account Manager',
    'Graduate Trainee', 'Customer Success Associate', 'Full Stack Developer', 'Supply Chain Analyst',
  ];
  const jobTypes = ['full_time', 'part_time', 'internship', 'contract'] as const;

  const JOB_COUNT = 20;
  for (let i = 0; i < JOB_COUNT; i++) {
    const postedDate = randomDateBetween(addDays(TODAY, -180), addDays(TODAY, -2));
    let status: 'open' | 'closed' | 'expired';
    let expiryDate: Date | null;
    if (i < 12) {
      status = 'open';
      // first few open jobs expire very soon, to populate "expiring_within_7_days"
      expiryDate = i < 3 ? addDays(TODAY, randInt(1, 6)) : addDays(TODAY, randInt(10, 60));
    } else if (i < 17) {
      status = 'closed';
      // expiry_date must be after posted_date (DB check constraint) — anchor to postedDate, not TODAY.
      expiryDate = addDays(postedDate, randInt(5, 60));
    } else {
      status = 'expired';
      expiryDate = addDays(postedDate, randInt(5, 60));
    }

    const poster = pick(profileIds);
    const job = await prisma.alumniJob.create({
      data: {
        institute_id: instId,
        posted_by_alumni_id: poster,
        title: jobTitles[i],
        company: pick(COMPANIES),
        description: `We are hiring for the role of ${jobTitles[i]}. Alumni referrals welcome.`,
        location: pick(['Bengaluru', 'Hyderabad', 'Pune', 'Remote', 'Chennai']),
        job_type: pick(jobTypes) as any,
        industry: pick(INDUSTRIES),
        posted_date: postedDate,
        expiry_date: expiryDate,
        status: status as any,
        closed_at: status !== 'open' ? addDays(postedDate, randInt(20, 90)) : null,
      },
    });

    const applicantCount = randInt(3, 9);
    const applicants = shuffle(profileIds.filter((id) => id !== poster)).slice(0, applicantCount);
    for (const applicantId of applicants) {
      const r = randInt(1, 100);
      const appStatus =
        status === 'open'
          ? r <= 50 ? 'applied' : r <= 80 ? 'shortlisted' : r <= 90 ? 'rejected' : 'withdrawn'
          : r <= 40 ? 'hired' : r <= 75 ? 'rejected' : r <= 90 ? 'shortlisted' : 'withdrawn';

      await prisma.alumniJobApplication.create({
        data: {
          institute_id: instId,
          job_id: job.job_id,
          applicant_alumni_id: applicantId,
          applied_at: addDays(postedDate, randInt(1, 15)),
          status: appStatus as any,
          cover_note: 'Interested in this opportunity based on my prior experience.',
          status_updated_at: appStatus !== 'applied' ? addDays(postedDate, randInt(16, 30)) : null,
          status_updated_by: appStatus !== 'applied' ? SEED_ACTOR : null,
        },
      });
    }
  }

  // ---- Donation campaigns + donation ledger --------------------------------
  const campaignDefs = [
    { title: 'Scholarship Fund 2026', goal: 1500000, startOffset: -150, endOffset: 90, status: 'active' as const },
    { title: 'Campus Library Renovation', goal: 800000, startOffset: -120, endOffset: 60, status: 'active' as const },
    { title: 'Sports Infrastructure Drive', goal: 1000000, startOffset: -90, endOffset: 120, status: 'active' as const },
    { title: 'Flood Relief Fund 2026', goal: 500000, startOffset: -170, endOffset: -40, status: 'closed' as const },
    { title: 'Annual Alumni Fund (Spring)', goal: 600000, startOffset: -160, endOffset: -60, status: 'completed' as const },
  ];

  const campaignIds: Array<{ id: number; status: string }> = [];
  for (const def of campaignDefs) {
    const campaign = await prisma.alumniCampaign.create({
      data: {
        institute_id: instId,
        title: def.title,
        description: `${def.title} — supporting our alma mater.`,
        goal_amount: def.goal,
        start_date: addDays(TODAY, def.startOffset),
        end_date: addDays(TODAY, def.endOffset),
        status: def.status,
        closed_at: def.status !== 'active' ? addDays(TODAY, def.endOffset + 1) : null,
        created_by: SEED_ACTOR,
      },
    });
    campaignIds.push({ id: campaign.campaign_id, status: def.status });
  }

  // Donations spread across the last 6 months (so the 12-month trend chart
  // has real month-over-month shape), mostly against active/closed
  // campaigns, with some unrestricted (general fund, campaign_id = null).
  const DONATION_COUNT = 140;
  let receiptSeq = 1;
  const donationRows: Prisma.AlumniDonationUncheckedCreateInput[] = [];
  for (let i = 0; i < DONATION_COUNT; i++) {
    const donationDate = randomDateBetween(addDays(TODAY, -180), addDays(TODAY, -1));
    const r = randInt(1, 100);
    const status = r <= 80 ? 'received' : r <= 90 ? 'pending' : r <= 96 ? 'failed' : r <= 99 ? 'cancelled' : 'reversed';
    const useCampaign = randInt(1, 100) <= 75;
    const campaign = useCampaign ? pick(campaignIds) : null;
    const amount = pick([500, 1000, 1500, 2000, 2500, 5000, 10000, 25000]);
    const isAnonymous = randInt(1, 100) <= 12;

    const receivedAt = status === 'received' ? addDays(donationDate, randInt(0, 2)) : null;

    donationRows.push({
      institute_id: instId,
      alumni_id: pick(profileIds),
      campaign_id: campaign?.id ?? null,
      amount,
      donation_date: donationDate,
      payment_mode: pick(['card', 'upi', 'bank_transfer', 'cheque']) as any,
      transaction_ref: `DON-TXN-${instId}-${i + 1}`,
      is_anonymous: isAnonymous,
      status: status as any,
      receipt_number: status === 'received' ? `RCPT-2026-${String(receiptSeq++).padStart(5, '0')}` : null,
      receipt_issued_at: status === 'received' ? receivedAt : null,
      received_at: receivedAt,
      received_by: status === 'received' ? SEED_ACTOR : null,
      recorded_by: SEED_ACTOR,
    });
  }
  for (const data of donationRows) {
    await prisma.alumniDonation.create({ data });
  }

  // Keep each active campaign's cached raised_amount roughly in sync with
  // the ledger (the dashboard itself always recomputes from the ledger, but
  // other screens read this cached column directly).
  for (const c of campaignIds) {
    const sum = await prisma.alumniDonation.aggregate({
      where: { institute_id: instId, campaign_id: c.id, status: 'received' },
      _sum: { amount: true },
    });
    await prisma.alumniCampaign.update({
      where: { campaign_id: c.id },
      data: { raised_amount: sum._sum.amount ?? 0 },
    });
  }

  console.log(
    `  (alumni) seeded ${PROFILE_COUNT} profiles, ${eventDefs.length} events, ${JOB_COUNT} jobs, ${campaignDefs.length} campaigns, ${DONATION_COUNT} donations`,
  );
}
