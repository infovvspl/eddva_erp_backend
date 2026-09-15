import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalRulesService } from './approval-rules.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';

describe('ApprovalRulesService.resolveRequiredRules', () => {
  let service: ApprovalRulesService;
  const mockPrisma = { spApprovalRule: { findMany: jest.fn() } };
  const mockAudit = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalRulesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SalesPurchaseAuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(ApprovalRulesService);
  });

  it('queries only active rules whose amount band contains the PO total, ordered by sequence', async () => {
    mockPrisma.spApprovalRule.findMany.mockResolvedValue([
      { rule_id: 1, min_amount: 500, max_amount: null, sequence: 1 },
    ]);

    const result = await service.resolveRequiredRules('INST_1', 1500);

    expect(mockPrisma.spApprovalRule.findMany).toHaveBeenCalledWith({
      where: {
        institute_id: 'INST_1',
        is_active: true,
        min_amount: { lte: 1500 },
        OR: [{ max_amount: null }, { max_amount: { gte: 1500 } }],
      },
      orderBy: { sequence: 'asc' },
    });
    expect(result).toHaveLength(1);
  });

  it('returns an empty chain when no rule matches (any permitted user may approve directly)', async () => {
    mockPrisma.spApprovalRule.findMany.mockResolvedValue([]);
    const result = await service.resolveRequiredRules('INST_1', 100);
    expect(result).toEqual([]);
  });
});
