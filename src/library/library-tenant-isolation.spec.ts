import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LibCategoriesService } from './categories/lib-categories.service';
import { LibMembersService } from './members/lib-members.service';
import { LibCatalogService } from './catalog/lib-catalog.service';
import { LibCopiesService } from './copies/lib-copies.service';
import { BarcodeService } from './copies/barcode.service';
import { LibBookVendorsService } from './book-vendors/lib-book-vendors.service';
import { LibMembershipRulesService } from './membership-rules/lib-membership-rules.service';
import { IssueService } from './issues/issue.service';
import { ReturnService } from './issues/return.service';
import { LibFinesService } from './fines/lib-fines.service';
import { LibReservationsService } from './reservations/lib-reservations.service';
import { LibNotificationService } from './notifications/lib-notification.service';
import { LibSchedulerService } from './scheduler/lib-scheduler.service';

const A = 'inst-a';
const B = 'inst-b';

// A stand-in for Prisma where every lookup finds nothing, exactly as the database
// answers when the row belongs to another institute.
function model(methods: string[] = ['findFirst', 'findMany', 'findUnique', 'count', 'create', 'update', 'delete', 'aggregate', 'updateMany']) {
  return Object.fromEntries(methods.map((m) => [m, jest.fn()]));
}
function makePrisma() {
  const prisma: any = {
    libCategory: model(),
    libMember: model(),
    libBook: model(),
    libBookCopy: model(),
    libBookVendor: model(),
    libMembershipRule: model(),
    libIssueRecord: model(),
    libReservation: model(),
    libFine: model(),
    libFinePayment: model(),
    libNotificationLog: model(),
    libUser: model(),
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  for (const m of Object.values(prisma) as any[]) {
    if (m && typeof m === 'object') {
      m.findFirst?.mockResolvedValue(null);
      m.findMany?.mockResolvedValue([]);
      m.findUnique?.mockResolvedValue(null);
      m.count?.mockResolvedValue(0);
    }
  }
  return prisma;
}

describe('Library tenant isolation', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = makePrisma();
  });

  describe('a missing institute fails closed', () => {
    it.each(['', '   ', undefined, null])('refuses %p instead of running an unfiltered query', async (bad) => {
      const categories = new LibCategoriesService(prisma);
      await expect(categories.findAll(bad as any)).rejects.toThrow(ForbiddenException);
      expect(prisma.libCategory.findMany).not.toHaveBeenCalled();
    });
  });

  describe('categories', () => {
    it('lists only the caller\'s categories', async () => {
      await new LibCategoriesService(prisma).findAll(A);
      expect(prisma.libCategory.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { institute_id: A } }));
    });

    it('checks name clashes per institute and stamps the new row', async () => {
      prisma.libCategory.create.mockResolvedValue({ category_id: 1 });
      await new LibCategoriesService(prisma).create(A, { name: 'Science' } as any);
      expect(prisma.libCategory.findFirst).toHaveBeenCalledWith({ where: { institute_id: A, name: 'Science' } });
      expect(prisma.libCategory.create).toHaveBeenCalledWith({ data: { name: 'Science', institute_id: A } });
    });

    it('cannot update or delete another institute\'s category', async () => {
      const svc = new LibCategoriesService(prisma);
      await expect(svc.update(B, 5, { name: 'x' } as any)).rejects.toThrow(NotFoundException);
      await expect(svc.remove(B, 5)).rejects.toThrow(NotFoundException);
      expect(prisma.libCategory.update).not.toHaveBeenCalled();
      expect(prisma.libCategory.delete).not.toHaveBeenCalled();
      expect(prisma.libCategory.findFirst).toHaveBeenCalledWith({ where: { category_id: 5, institute_id: B } });
    });
  });

  describe('members', () => {
    it('numbers cards within the institute and stamps the member', async () => {
      prisma.libMember.count.mockResolvedValue(6);
      prisma.libMember.create.mockImplementation(async ({ data }: any) => data);
      const created: any = await new LibMembersService(prisma).create(A, { name: 'Asha', member_type: 'student' } as any);
      expect(prisma.libMember.count).toHaveBeenCalledWith({ where: { institute_id: A } });
      expect(created.institute_id).toBe(A);
      expect(created.library_card_number).toMatch(/-00007$/);
    });

    it('filters the list and the count by institute', async () => {
      await new LibMembersService(prisma).findAll(A, { search: 'a' } as any);
      const where = prisma.libMember.findMany.mock.calls[0][0].where;
      expect(where.institute_id).toBe(A);
      expect(prisma.libMember.count.mock.calls[0][0].where.institute_id).toBe(A);
    });

    it('reports another institute\'s member as not found, without reading their loans or fines', async () => {
      const svc = new LibMembersService(prisma);
      await expect(svc.findOne(B, 9)).rejects.toThrow(NotFoundException);
      await expect(svc.getCurrentIssues(B, 9)).rejects.toThrow(NotFoundException);
      await expect(svc.getFines(B, 9)).rejects.toThrow(NotFoundException);
      expect(prisma.libIssueRecord.findMany).not.toHaveBeenCalled();
      expect(prisma.libFine.findMany).not.toHaveBeenCalled();
    });
  });

  describe('catalog', () => {
    it('will not attach a book to another institute\'s category', async () => {
      const svc = new LibCatalogService(prisma);
      await expect(svc.create(A, { title: 't', author: 'a', category_id: 99 } as any)).rejects.toThrow(BadRequestException);
      expect(prisma.libCategory.findFirst).toHaveBeenCalledWith({ where: { category_id: 99, institute_id: A } });
      expect(prisma.libBook.create).not.toHaveBeenCalled();
    });

    it('creates the book in the caller\'s institute and checks ISBN per institute', async () => {
      prisma.libCategory.findFirst.mockResolvedValue({ category_id: 1 });
      prisma.libBook.create.mockResolvedValue({ book_id: 1 });
      await new LibCatalogService(prisma).create(A, { title: 't', author: 'a', isbn: '111', category_id: 1 } as any);
      expect(prisma.libBook.findFirst).toHaveBeenCalledWith({ where: { institute_id: A, isbn: '111' } });
      expect(prisma.libBook.create.mock.calls[0][0].data.institute_id).toBe(A);
    });

    it('cannot move a book into another institute\'s category on update', async () => {
      prisma.libBook.findFirst.mockResolvedValue({ book_id: 1, institute_id: A });
      await expect(new LibCatalogService(prisma).update(A, 1, { category_id: 99 } as any)).rejects.toThrow(BadRequestException);
      expect(prisma.libBook.update).not.toHaveBeenCalled();
    });

    it('scopes browse, search and detail', async () => {
      const svc = new LibCatalogService(prisma);
      await svc.findAll(A, {} as any);
      await svc.search(A, 'abc');
      expect(prisma.libBook.findMany.mock.calls[0][0].where.institute_id).toBe(A);
      expect(prisma.libBook.findMany.mock.calls[1][0].where.institute_id).toBe(A);
      await expect(svc.findOne(B, 3)).rejects.toThrow(NotFoundException);
      await expect(svc.remove(B, 3)).rejects.toThrow(NotFoundException);
      expect(prisma.libBook.delete).not.toHaveBeenCalled();
    });
  });

  describe('copies, barcodes and vendors', () => {
    it('cannot add a copy to another institute\'s book', async () => {
      await expect(new LibCopiesService(prisma).create(B, 4, { barcode: 'x' } as any)).rejects.toThrow(NotFoundException);
      expect(prisma.libBookCopy.create).not.toHaveBeenCalled();
    });

    it('checks the barcode per institute and numbers accessions per institute', async () => {
      prisma.libBook.findFirst.mockResolvedValue({ book_id: 4 });
      prisma.libBookCopy.count.mockResolvedValue(11);
      prisma.libBookCopy.create.mockImplementation(async ({ data }: any) => data);
      const copy: any = await new LibCopiesService(prisma).create(A, 4, { barcode: 'BC1' } as any);
      expect(prisma.libBookCopy.findFirst).toHaveBeenCalledWith({ where: { institute_id: A, barcode: 'BC1' } });
      expect(prisma.libBookCopy.count).toHaveBeenCalledWith({ where: { institute_id: A } });
      expect(copy.institute_id).toBe(A);
      expect(copy.accession_number).toMatch(/-000012$/);
    });

    it('a barcode scan never resolves a copy from another institute', async () => {
      await expect(new BarcodeService(prisma).resolve(B, 'BC1')).rejects.toThrow(NotFoundException);
      expect(prisma.libBookCopy.findFirst.mock.calls[0][0].where).toEqual({ institute_id: B, barcode: 'BC1' });
    });

    it('scopes vendors through their book\'s institute', async () => {
      const svc = new LibBookVendorsService(prisma);
      await expect(svc.update(B, 7, {} as any)).rejects.toThrow(NotFoundException);
      await expect(svc.remove(B, 7)).rejects.toThrow(NotFoundException);
      expect(prisma.libBookVendor.findFirst).toHaveBeenCalledWith({ where: { book_vendor_id: 7, book: { institute_id: B } } });
      expect(prisma.libBookVendor.update).not.toHaveBeenCalled();
      expect(prisma.libBookVendor.delete).not.toHaveBeenCalled();
    });
  });

  describe('membership rules', () => {
    it('are looked up and created per institute', async () => {
      const svc = new LibMembershipRulesService(prisma);
      await expect(svc.findByMemberType(A, 'student')).rejects.toThrow(NotFoundException);
      expect(prisma.libMembershipRule.findFirst).toHaveBeenCalledWith({ where: { institute_id: A, member_type: 'student' } });
      prisma.libMembershipRule.create.mockResolvedValue({});
      await svc.create(A, { member_type: 'student' } as any);
      expect(prisma.libMembershipRule.create.mock.calls[0][0].data.institute_id).toBe(A);
    });
  });

  describe('issuing and returning', () => {
    const rules = { findByMemberType: jest.fn() };
    const dto = { copy_id: 1, member_id: 2, issued_by: 3 } as any;

    it('will not issue another institute\'s copy', async () => {
      const svc = new IssueService(prisma, rules as any);
      await expect(svc.issueBook(A, dto)).rejects.toThrow(NotFoundException);
      expect(prisma.libBookCopy.findFirst).toHaveBeenCalledWith({ where: { copy_id: 1, institute_id: A } });
      expect(prisma.libIssueRecord.create).not.toHaveBeenCalled();
    });

    it('will not issue to another institute\'s member', async () => {
      prisma.libBookCopy.findFirst.mockResolvedValue({ copy_id: 1, status: 'available', book_id: 5 });
      prisma.libUser.findUnique.mockResolvedValue({ user_id: 3 });
      const svc = new IssueService(prisma, rules as any);
      await expect(svc.issueBook(A, dto)).rejects.toThrow(NotFoundException);
      expect(prisma.libMember.findFirst).toHaveBeenCalledWith({ where: { member_id: 2, institute_id: A } });
      expect(prisma.libIssueRecord.create).not.toHaveBeenCalled();
    });

    it('stamps the issue record and reads the school\'s own rule', async () => {
      prisma.libBookCopy.findFirst.mockResolvedValue({ copy_id: 1, status: 'available', book_id: 5 });
      prisma.libUser.findUnique.mockResolvedValue({ user_id: 3 });
      prisma.libMember.findFirst.mockResolvedValue({ member_id: 2, status: 'active', member_type: 'student' });
      prisma.libFine.aggregate.mockResolvedValue({ _sum: { amount: null } });
      rules.findByMemberType.mockResolvedValue({ max_books_allowed: 3, loan_period_days: 14, fine_per_day: 1, grace_period_days: 0, max_fine_cap: null });
      prisma.libIssueRecord.create.mockResolvedValue({ issue_id: 10 });
      prisma.libBookCopy.update.mockResolvedValue({});

      await new IssueService(prisma, rules as any).issueBook(A, dto);

      expect(rules.findByMemberType).toHaveBeenCalledWith(A, 'student');
      expect(prisma.libIssueRecord.create.mock.calls[0][0].data.institute_id).toBe(A);
    });

    it('cannot renew, view or list another institute\'s loans', async () => {
      const svc = new IssueService(prisma, rules as any);
      await expect(svc.renewIssue(B, 9, {} as any)).rejects.toThrow(NotFoundException);
      await expect(svc.findOne(B, 9)).rejects.toThrow(NotFoundException);
      await svc.findAll(B, 'issued');
      await svc.findOverdue(B);
      expect(prisma.libIssueRecord.findMany.mock.calls[0][0].where).toEqual({ institute_id: B, status: 'issued' });
      expect(prisma.libIssueRecord.findMany.mock.calls[1][0].where).toEqual({ institute_id: B, status: 'overdue' });
    });

    it('cannot return another institute\'s loan', async () => {
      const svc = new ReturnService(prisma, { sendFineAlert: jest.fn(), sendReservationReady: jest.fn(), sendReturnConfirmation: jest.fn() } as any);
      await expect(svc.returnBook(B, 9, {} as any)).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('stamps the overdue fine and only queues reservations from the same institute', async () => {
      const notifier = { sendFineAlert: jest.fn(), sendReservationReady: jest.fn(), sendReturnConfirmation: jest.fn() };
      prisma.libIssueRecord.findFirst.mockResolvedValue({
        issue_id: 9, status: 'overdue', copy_id: 1, member_id: 2, copy: { book_id: 5 },
        due_date: new Date('2020-01-01'), grace_period_days: 0, fine_per_day: 2, max_fine_cap: null,
      });
      prisma.libUser.findUnique.mockResolvedValue({ user_id: 1 });
      prisma.libIssueRecord.update.mockResolvedValue({});
      prisma.libBookCopy.update.mockResolvedValue({});
      prisma.libFine.create.mockResolvedValue({ fine_id: 4 });

      await new ReturnService(prisma, notifier as any).returnBook(A, 9, {} as any);

      expect(prisma.libFine.create.mock.calls[0][0].data.institute_id).toBe(A);
      expect(prisma.libReservation.findFirst.mock.calls[0][0].where.institute_id).toBe(A);
    });
  });

  describe('fines', () => {
    it('cannot read, pay or waive another institute\'s fine', async () => {
      const svc = new LibFinesService(prisma, { sendFineAlert: jest.fn() } as any);
      await expect(svc.findOne(B, 4)).rejects.toThrow(NotFoundException);
      await expect(svc.pay(B, 4, { amount_paid: 1, received_by: 1 } as any)).rejects.toThrow(NotFoundException);
      await expect(svc.waive(B, 4, {} as any)).rejects.toThrow(NotFoundException);
      expect(prisma.libFinePayment.create).not.toHaveBeenCalled();
      expect(prisma.libFine.update).not.toHaveBeenCalled();
    });

    it('stamps fines it creates', async () => {
      prisma.libFine.create.mockResolvedValue({ fine_id: 1 });
      await new LibFinesService(prisma, { sendFineAlert: jest.fn() } as any).createFine(A, 9, 2, 'overdue', 10);
      expect(prisma.libFine.create.mock.calls[0][0].data.institute_id).toBe(A);
    });
  });

  describe('reservations', () => {
    it('cannot reserve another institute\'s book or for another institute\'s member', async () => {
      const svc = new LibReservationsService(prisma, { sendReservationReady: jest.fn() } as any);
      await expect(svc.create(A, { book_id: 1, member_id: 2 } as any)).rejects.toThrow(NotFoundException);
      prisma.libBook.findFirst.mockResolvedValue({ book_id: 1 });
      await expect(svc.create(A, { book_id: 1, member_id: 2 } as any)).rejects.toThrow(NotFoundException);
      expect(prisma.libReservation.create).not.toHaveBeenCalled();
    });

    it('cannot cancel another institute\'s reservation and lists only its own', async () => {
      const svc = new LibReservationsService(prisma, { sendReservationReady: jest.fn() } as any);
      await expect(svc.cancel(B, 3)).rejects.toThrow(NotFoundException);
      await svc.findAll(B, 'pending');
      expect(prisma.libReservation.findMany.mock.calls[0][0].where).toEqual({ institute_id: B, status: 'pending' });
    });
  });

  describe('notification logs', () => {
    it('are scoped through the member\'s institute', async () => {
      await new LibNotificationService(prisma).findAllLogs(A, 12);
      expect(prisma.libNotificationLog.findMany.mock.calls[0][0].where).toEqual({ member: { institute_id: A }, member_id: 12 });
    });
  });

  describe('scheduler', () => {
    it('does not raise fines for loans that have no institute yet', async () => {
      prisma.libIssueRecord.updateMany.mockResolvedValue({ count: 0 });
      prisma.libReservation.updateMany.mockResolvedValue({ count: 0 });
      prisma.libIssueRecord.findMany.mockResolvedValue([
        { issue_id: 1, member_id: 1, institute_id: null, due_date: new Date('2020-01-01'), grace_period_days: 0, fine_per_day: 1, max_fine_cap: null },
        { issue_id: 2, member_id: 2, institute_id: A, due_date: new Date('2020-01-01'), grace_period_days: 0, fine_per_day: 1, max_fine_cap: null },
      ]);
      const fines = { calculateFine: jest.fn().mockReturnValue(5), createFine: jest.fn() };
      const notifier = { sendOverdueAlert: jest.fn() };

      await new LibSchedulerService(prisma, fines as any, notifier as any).runDailyLibraryJob();

      expect(fines.createFine).toHaveBeenCalledTimes(1);
      expect(fines.createFine).toHaveBeenCalledWith(A, 2, 2, 'overdue', 5);
    });
  });
});
