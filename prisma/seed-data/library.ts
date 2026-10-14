import { PrismaClient, LibCategory } from '@prisma/client';

/**
 * Seeds ~6 months (2026-05-01 .. 2026-10-14, "today") of realistic Library
 * transactional data: categories, a multi-title book catalog with several
 * copies each, members, issue/return records (including currently-overdue
 * and due-soon loans), fines + fine payments, and reservations — so the
 * Library dashboard (titles/copies, available vs issued, overdue, active
 * members, pending reservations, unpaid fines, due-soon/recent-issues
 * lists) and the main dashboard's library summary are populated.
 *
 * Safe to re-run: guarded by an early-return once enough issue records
 * already exist for this institute.
 */

const TODAY = new Date(Date.UTC(2026, 9, 14)); // 2026-10-14
const RANGE_START = new Date(Date.UTC(2026, 4, 1)); // 2026-05-01
const SEED_ISSUE_THRESHOLD = 150;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function dateAtOffset(baseDate: Date, dayOffset: number): Date {
  const d = new Date(baseDate);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function seedLibrary(prisma: PrismaClient, instId: string): Promise<void> {
  console.log('--- Seeding Library Transactional Data (last ~6 months) ---');

  const existingIssues = await prisma.libIssueRecord.count({ where: { institute_id: instId } });
  if (existingIssues >= SEED_ISSUE_THRESHOLD) {
    console.log(`Library already has ${existingIssues} issue records for ${instId} — skipping.`);
    return;
  }

  const totalDays = daysBetween(RANGE_START, TODAY) + 1;

  // ------------------------------------------------------------------
  // Librarian users (global, not institute-scoped — guard by name)
  // ------------------------------------------------------------------
  let librarian = await prisma.libUser.findFirst({ where: { name: 'Demo Librarian' } });
  if (!librarian) {
    librarian = await prisma.libUser.create({ data: { name: 'Demo Librarian', role: 'librarian' } });
  }
  let libAdmin = await prisma.libUser.findFirst({ where: { name: 'Demo Library Admin' } });
  if (!libAdmin) {
    libAdmin = await prisma.libUser.create({ data: { name: 'Demo Library Admin', role: 'admin' } });
  }
  const libUsers = [librarian, libAdmin];

  // ------------------------------------------------------------------
  // Categories
  // ------------------------------------------------------------------
  const categoryNames = ['Fiction', 'Science', 'Reference', 'Children', 'Biography', 'Technology'];
  const categories: LibCategory[] = [];
  for (const name of categoryNames) {
    const cat = await prisma.libCategory.upsert({
      where: { institute_id_name: { institute_id: instId, name } },
      update: {},
      create: { institute_id: instId, name },
    });
    categories.push(cat);
  }

  // ------------------------------------------------------------------
  // Books + Copies
  // ------------------------------------------------------------------
  const bookDefs: Array<{ title: string; author: string; category: string }> = [
    { title: 'The Alchemist', author: 'Paulo Coelho', category: 'Fiction' },
    { title: 'To Kill a Mockingbird', author: 'Harper Lee', category: 'Fiction' },
    { title: 'Pride and Prejudice', author: 'Jane Austen', category: 'Fiction' },
    { title: '1984', author: 'George Orwell', category: 'Fiction' },
    { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', category: 'Fiction' },
    { title: 'A Brief History of Time', author: 'Stephen Hawking', category: 'Science' },
    { title: 'The Selfish Gene', author: 'Richard Dawkins', category: 'Science' },
    { title: 'Cosmos', author: 'Carl Sagan', category: 'Science' },
    { title: 'Sapiens', author: 'Yuval Noah Harari', category: 'Science' },
    { title: 'Encyclopedia of Knowledge Vol. 1', author: 'Editorial Board', category: 'Reference' },
    { title: 'Oxford English Dictionary (Concise)', author: 'Oxford Press', category: 'Reference' },
    { title: 'World Atlas', author: 'National Geographic', category: 'Reference' },
    { title: 'Charlie and the Chocolate Factory', author: 'Roald Dahl', category: 'Children' },
    { title: 'Matilda', author: 'Roald Dahl', category: 'Children' },
    { title: 'The Jungle Book', author: 'Rudyard Kipling', category: 'Children' },
    { title: 'Panchatantra Tales', author: 'Vishnu Sharma', category: 'Children' },
    { title: 'Steve Jobs', author: 'Walter Isaacson', category: 'Biography' },
    { title: 'Wings of Fire', author: 'A.P.J. Abdul Kalam', category: 'Biography' },
    { title: 'Long Walk to Freedom', author: 'Nelson Mandela', category: 'Biography' },
    { title: 'Clean Code', author: 'Robert C. Martin', category: 'Technology' },
    { title: 'Introduction to Algorithms', author: 'Thomas H. Cormen', category: 'Technology' },
    { title: 'The Pragmatic Programmer', author: 'David Thomas', category: 'Technology' },
  ];

  const catByName = new Map(categories.map((c) => [c.name, c]));
  const books: Array<{ book_id: number; title: string }> = [];
  const copiesByBook = new Map<number, number[]>(); // book_id -> copy_ids

  let isbnSeq = 1;
  for (const def of bookDefs) {
    const isbn = `ISBN-${instId}-${String(isbnSeq++).padStart(4, '0')}`;
    const cat = catByName.get(def.category)!;
    const book = await prisma.libBook.upsert({
      where: { institute_id_isbn: { institute_id: instId, isbn } },
      update: { title: def.title, author: def.author, category_id: cat.category_id },
      create: {
        institute_id: instId,
        isbn,
        title: def.title,
        author: def.author,
        publisher: 'Demo Publishing House',
        edition: '1st',
        category_id: cat.category_id,
        language: 'English',
        publish_year: randomInt(1990, 2024),
      },
    });
    books.push({ book_id: book.book_id, title: book.title });

    const copyCount = randomInt(2, 4);
    const copyIds: number[] = [];
    for (let c = 1; c <= copyCount; c++) {
      const barcode = `LBC-${instId}-${book.book_id}-${c}`;
      const accession = `ACC-${instId}-${book.book_id}-${c}`;
      const copy = await prisma.libBookCopy.upsert({
        where: { institute_id_barcode: { institute_id: instId, barcode } },
        update: {},
        create: {
          institute_id: instId,
          book_id: book.book_id,
          barcode,
          accession_number: accession,
          rack_location: `${def.category.slice(0, 2).toUpperCase()}-${randomInt(1, 20)}`,
          condition: randomChoice(['new', 'good', 'good', 'worn']),
          status: 'available',
          acquired_date: dateAtOffset(RANGE_START, -randomInt(30, 400)),
          price: randomInt(150, 900),
        },
      });
      copyIds.push(copy.copy_id);
    }
    copiesByBook.set(book.book_id, copyIds);
  }

  // ------------------------------------------------------------------
  // Members
  // ------------------------------------------------------------------
  const MEMBER_COUNT = 60;
  const names = [
    'Aarav Kumar', 'Vivaan Sharma', 'Aditya Rao', 'Ishaan Gupta', 'Rohan Mehta',
    'Ananya Iyer', 'Diya Nair', 'Isha Reddy', 'Kavya Pillai', 'Riya Menon',
    'Karthik Das', 'Nikhil Joshi', 'Varun Patel', 'Sanjay Verma', 'Deepak Singh',
    'Priya Agarwal', 'Neha Kapoor', 'Divya Chawla', 'Sneha Bhatt', 'Pooja Malhotra',
    'Rahul Saxena', 'Akash Khanna', 'Manish Tiwari', 'Suresh Pandey', 'Ramesh Yadav',
    'Lakshmi Krishnan', 'Meena Subramaniam', 'Geeta Rajan', 'Sunita Bose', 'Anita Ghosh',
    'Vikram Chandra', 'Harish Babu', 'Naveen Kumar', 'Pradeep Shetty', 'Kiran Hegde',
    'Latha Murthy', 'Shalini Rao', 'Swathi Acharya', 'Vani Desai', 'Usha Bhandari',
    'Arjun Malik', 'Sai Teja', 'Reyansh Jain', 'Krishna Bhat', 'Mohit Arora',
    'Tanvi Kulkarni', 'Pallavi Deshpande', 'Shreya Oberoi', 'Nandini Trivedi', 'Ayesha Khan',
    'Zoya Siddiqui', 'Farhan Ahmed', 'Imran Qureshi', 'Rakesh Chauhan', 'Sandeep Rawat',
    'Alok Mishra', 'Vinod Sinha', 'Ajay Dubey', 'Rajesh Goyal', 'Mahesh Thakur',
  ];
  const members: Array<{ member_id: number }> = [];
  for (let i = 0; i < MEMBER_COUNT; i++) {
    const memberType = i < 45 ? 'student' : i < 55 ? 'staff' : 'faculty';
    const cardNumber = `LIB-${instId}-${3000 + i}`;
    const member = await prisma.libMember.upsert({
      where: { institute_id_library_card_number: { institute_id: instId, library_card_number: cardNumber } },
      update: { name: names[i % names.length] },
      create: {
        institute_id: instId,
        external_ref_id: `${memberType.toUpperCase()}-${3000 + i}`,
        name: names[i % names.length],
        member_type: memberType,
        library_card_number: cardNumber,
        status: 'active',
      },
    });
    members.push({ member_id: member.member_id });
  }

  // ------------------------------------------------------------------
  // Issue Records + Fines + Fine Payments, spread across the range.
  // Track copy status as we go so it stays consistent with open loans.
  // ------------------------------------------------------------------
  const copyStatus = new Map<number, 'available' | 'issued'>();
  for (const ids of copiesByBook.values()) for (const id of ids) copyStatus.set(id, 'available');

  const allCopyIds = Array.from(copyStatus.keys());
  const issueRows: Array<{
    copy_id: number;
    member_id: number;
    issue_date: Date;
    due_date: Date;
    return_date: Date | null;
    status: 'issued' | 'returned' | 'overdue' | 'lost';
    issued_by: number;
    returned_to: number | null;
    fine_per_day: number;
  }> = [];

  const TOTAL_ISSUES = 220;
  for (let n = 0; n < TOTAL_ISSUES; n++) {
    // Pick an available copy to avoid double-issuing the same copy concurrently.
    const availableCopies = allCopyIds.filter((id) => copyStatus.get(id) === 'available');
    if (availableCopies.length === 0) break;
    const copyId = randomChoice(availableCopies);

    const member = randomChoice(members);
    const issueDay = randomInt(0, totalDays - 4); // leave room for a loan period
    const issueDate = dateAtOffset(RANGE_START, issueDay);
    const loanPeriod = 14;
    const dueDate = dateAtOffset(issueDate, loanPeriod);
    const finePerDay = 5;

    const daysSinceDue = daysBetween(dueDate, TODAY);

    let status: 'issued' | 'returned' | 'overdue' | 'lost';
    let returnDate: Date | null = null;

    if (daysSinceDue < 0) {
      // Not yet due — still on loan, currently issued (may be "due soon").
      status = 'issued';
      copyStatus.set(copyId, 'issued');
    } else if (Math.random() < 0.72) {
      // Returned at some point between issue and (due_date + up to 10 days).
      status = 'returned';
      const extra = randomInt(-3, 10);
      const rawReturn = dateAtOffset(dueDate, Math.max(extra, -Math.min(loanPeriod - 1, 10)));
      returnDate = rawReturn.getTime() > TODAY.getTime() ? TODAY : rawReturn;
      copyStatus.set(copyId, 'available');
    } else if (Math.random() < 0.95) {
      // Past due, never returned — overdue.
      status = 'overdue';
      copyStatus.set(copyId, 'issued');
    } else {
      // Rare: lost book.
      status = 'lost';
      copyStatus.set(copyId, 'issued');
    }

    issueRows.push({
      copy_id: copyId,
      member_id: member.member_id,
      issue_date: issueDate,
      due_date: dueDate,
      return_date: returnDate,
      status,
      issued_by: librarian.user_id,
      returned_to: status === 'returned' ? randomChoice(libUsers).user_id : null,
      fine_per_day: finePerDay,
    });
  }

  for (const row of issueRows) {
    const issue = await prisma.libIssueRecord.create({
      data: {
        institute_id: instId,
        copy_id: row.copy_id,
        member_id: row.member_id,
        issue_date: row.issue_date,
        due_date: row.due_date,
        return_date: row.return_date,
        status: row.status,
        issued_by: row.issued_by,
        returned_to: row.returned_to,
        fine_per_day: row.fine_per_day,
        grace_period_days: 1,
        max_fine_cap: 200,
      },
    });

    await prisma.libBookCopy.update({
      where: { copy_id: row.copy_id },
      data: { status: copyStatus.get(row.copy_id) },
    });

    // Fine for returned-late / overdue / lost loans.
    const effectiveEnd = row.return_date ?? TODAY;
    const lateDays = Math.max(0, daysBetween(row.due_date, effectiveEnd) - 1 /* grace */);
    if ((row.status === 'returned' && lateDays > 0) || row.status === 'overdue' || row.status === 'lost') {
      const reason: 'overdue' | 'lost_book' = row.status === 'lost' ? 'lost_book' : 'overdue';
      const baseAmount = reason === 'lost_book' ? 500 : Math.min(200, round2(lateDays * row.fine_per_day || row.fine_per_day));
      const amount = Math.max(amountFloor(reason), baseAmount);

      let fineStatus: 'pending' | 'paid' | 'waived' | 'partially_paid' = 'pending';
      if (row.status === 'returned') {
        fineStatus = randomChoice(['paid', 'paid', 'pending', 'partially_paid', 'waived']);
      }

      const fine = await prisma.libFine.create({
        data: {
          institute_id: instId,
          issue_id: issue.issue_id,
          member_id: row.member_id,
          reason,
          amount,
          status: fineStatus,
          calculated_at: effectiveEnd,
        },
      });

      if (fineStatus === 'paid' || fineStatus === 'partially_paid') {
        const paidAmount = fineStatus === 'paid' ? amount : round2(amount * 0.5);
        await prisma.libFinePayment.create({
          data: {
            fine_id: fine.fine_id,
            amount_paid: paidAmount,
            payment_date: effectiveEnd,
            payment_mode: randomChoice(['cash', 'card', 'upi']),
            received_by: randomChoice(libUsers).user_id,
            transaction_ref: fineStatus === 'paid' ? `FINEPAY-${fine.fine_id}` : null,
          },
        });
      }
    }
  }

  function amountFloor(reason: 'overdue' | 'lost_book'): number {
    return reason === 'lost_book' ? 500 : 5;
  }

  // ------------------------------------------------------------------
  // Reservations
  // ------------------------------------------------------------------
  const RESERVATION_COUNT = 25;
  const reservationStatuses: Array<'pending' | 'ready_for_pickup' | 'fulfilled' | 'cancelled' | 'expired'> = [
    'pending',
    'ready_for_pickup',
    'fulfilled',
    'cancelled',
    'expired',
  ];
  for (let i = 0; i < RESERVATION_COUNT; i++) {
    const book = randomChoice(books);
    const member = randomChoice(members);
    const day = randomInt(0, totalDays - 1);
    const reservedDate = dateAtOffset(RANGE_START, day);
    const expiryDate = dateAtOffset(reservedDate, 7);
    const status = i < 8
      ? randomChoice<'pending' | 'ready_for_pickup'>(['pending', 'ready_for_pickup'])
      : randomChoice(reservationStatuses);

    await prisma.libReservation.create({
      data: {
        institute_id: instId,
        book_id: book.book_id,
        member_id: member.member_id,
        reserved_date: reservedDate,
        status,
        expiry_date: expiryDate,
      },
    });
  }

  console.log(
    `Library seeded: ${categories.length} categories, ${books.length} books, ` +
      `${Array.from(copiesByBook.values()).reduce((s, a) => s + a.length, 0)} copies, ` +
      `${members.length} members, ${issueRows.length} issue records, ${RESERVATION_COUNT} reservations ` +
      `(${RANGE_START.toISOString().slice(0, 10)} .. ${TODAY.toISOString().slice(0, 10)}).`,
  );
}
