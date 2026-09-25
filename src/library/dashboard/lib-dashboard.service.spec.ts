import { ForbiddenException } from '@nestjs/common';
import { LibDashboardService } from './lib-dashboard.service';

function makePrisma() {
  const count = jest.fn().mockResolvedValue(0);
  return {
    libBook: { count: jest.fn().mockResolvedValue(12) },
    libBookCopy: { count: jest.fn().mockImplementation(async ({ where }: any) => (where.status ? 30 : 40)) },
    libMember: { count: jest.fn().mockResolvedValue(9) },
    libReservation: { count: jest.fn().mockResolvedValue(2) },
    libIssueRecord: { count, findMany: jest.fn().mockResolvedValue([]) },
    libFine: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 100 } }) },
    libFinePayment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount_paid: 35.5 } }) },
  };
}

describe('LibDashboardService', () => {
  it('scopes every query to the caller\'s institute', async () => {
    const prisma = makePrisma();
    await new LibDashboardService(prisma as any).getSummary('inst-a');

    const wheres: any[] = [
      prisma.libBook.count.mock.calls[0][0].where,
      ...prisma.libBookCopy.count.mock.calls.map((c: any) => c[0].where),
      prisma.libMember.count.mock.calls[0][0].where,
      prisma.libReservation.count.mock.calls[0][0].where,
      ...prisma.libIssueRecord.count.mock.calls.map((c: any) => c[0].where),
      ...prisma.libIssueRecord.findMany.mock.calls.map((c: any) => c[0].where),
      prisma.libFine.aggregate.mock.calls[0][0].where,
      prisma.libFinePayment.aggregate.mock.calls[0][0].where.fine,
    ];
    expect(wheres.length).toBeGreaterThan(9);
    for (const where of wheres) expect(where.institute_id).toBe('inst-a');
  });

  it('reports outstanding fines net of part-payments and shapes the lists', async () => {
    const prisma = makePrisma();
    prisma.libIssueRecord.findMany.mockResolvedValue([
      {
        issue_id: 1,
        issue_date: new Date('2026-09-01'),
        due_date: new Date('2026-09-15'),
        return_date: null,
        status: 'issued',
        copy: { book: { title: 'Physics' } },
        member: { name: 'Asha' },
      },
    ]);
    const summary = await new LibDashboardService(prisma as any).getSummary('inst-a');

    expect(summary.totals).toMatchObject({ titles: 12, copies: 40, available_copies: 30, active_members: 9, pending_reservations: 2, unpaid_fines: 64.5 });
    expect(summary.recent_issues[0]).toMatchObject({ issue_id: 1, title: 'Physics', member_name: 'Asha', status: 'issued' });
    expect(summary.due_soon[0]).toMatchObject({ title: 'Physics', member_name: 'Asha' });
  });

  it('refuses a session with no institute', async () => {
    const prisma = makePrisma();
    await expect(new LibDashboardService(prisma as any).getSummary('')).rejects.toThrow(ForbiddenException);
    expect(prisma.libBook.count).not.toHaveBeenCalled();
  });
});
