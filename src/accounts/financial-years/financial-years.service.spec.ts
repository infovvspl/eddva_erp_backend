import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { FinancialYearsService } from './financial-years.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsAuditService } from '../common/accounts-audit.service';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';

const actor: AccountsPlatformUser = {
  eddva_user_id: 'user-1',
  institute_id: 'inst-1',
  user_name: 'Test Accountant',
  user_role: 'ACCOUNTANT',
  is_institute_admin: false,
};

describe('FinancialYearsService', () => {
  let service: FinancialYearsService;

  const mockPrisma = { financialYear: { findFirst: jest.fn(), create: jest.fn() } };
  const mockAudit = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [FinancialYearsService, { provide: PrismaService, useValue: mockPrisma }, { provide: AccountsAuditService, useValue: mockAudit }],
    }).compile();
    service = module.get(FinancialYearsService);
  });

  describe('create', () => {
    it('creates a financial year with no overlap', async () => {
      mockPrisma.financialYear.findFirst.mockResolvedValue(null);
      mockPrisma.financialYear.create.mockResolvedValue({ id: 'fy-1', fyLabel: '2026-27' });
      const result = await service.create({ fyLabel: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31' } as any, actor);
      expect(result.fyLabel).toBe('2026-27');
    });

    it('rejects an end date before the start date', async () => {
      await expect(service.create({ fyLabel: 'X', startDate: '2027-03-31', endDate: '2026-04-01' } as any, actor)).rejects.toThrow(BadRequestException);
    });

    it('rejects a financial year whose dates overlap an existing one', async () => {
      mockPrisma.financialYear.findFirst
        .mockResolvedValueOnce(null) // label clash check
        .mockResolvedValueOnce({ fyLabel: '2026-27' }); // overlap check
      await expect(service.create({ fyLabel: '2027-28', startDate: '2026-06-01', endDate: '2027-06-01' } as any, actor)).rejects.toThrow(ConflictException);
    });
  });

  describe('assertOpenAndDateInRange (Rules 4 & 6)', () => {
    const fy = { id: 'fy-1', status: 'OPEN', fyLabel: '2026-27', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31') } as any;

    it('allows a voucher dated within an open financial year', async () => {
      await expect(service.assertOpenAndDateInRange(fy, new Date('2026-09-03'))).resolves.toBeUndefined();
    });

    it('rejects a voucher against a closed financial year', async () => {
      await expect(service.assertOpenAndDateInRange({ ...fy, status: 'CLOSED' }, new Date('2026-09-03'))).rejects.toThrow(BadRequestException);
    });

    it('rejects a voucher date outside the financial year range', async () => {
      await expect(service.assertOpenAndDateInRange(fy, new Date('2025-01-01'))).rejects.toThrow(BadRequestException);
    });
  });
});
