import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalRulesService } from './approval-rules.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ApprovalRulesService', () => {
  let service: ApprovalRulesService;
  const mockPrisma = {
    invApprovalRule: { findFirst: jest.fn() },
    invItemVendor: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApprovalRulesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(ApprovalRulesService);
  });

  it('requires no approval when no rule matches', async () => {
    mockPrisma.invApprovalRule.findFirst.mockResolvedValue(null);
    const result = await service.resolveForIssue(1, 1, 5);
    expect(result).toEqual({ required: false });
  });

  it('a category-specific rule takes precedence over a global rule', async () => {
    mockPrisma.invApprovalRule.findFirst
      .mockResolvedValueOnce({ rule_id: 1, category_id: 1, quantity_threshold: 5, value_threshold: null, is_active: true }) // specific
      .mockResolvedValueOnce({ rule_id: 2, category_id: null, quantity_threshold: 100, value_threshold: null, is_active: true }); // global

    const result = await service.resolveForIssue(1, 1, 10);
    expect(result).toEqual({ required: true, rule_id: 1 });
  });

  it('requires approval once quantity meets the threshold', async () => {
    mockPrisma.invApprovalRule.findFirst.mockResolvedValueOnce({ rule_id: 1, category_id: 1, quantity_threshold: 10, value_threshold: null, is_active: true }).mockResolvedValueOnce(null);
    const result = await service.resolveForIssue(1, 1, 10);
    expect(result.required).toBe(true);
  });

  it('does not require approval below the quantity threshold', async () => {
    mockPrisma.invApprovalRule.findFirst.mockResolvedValueOnce({ rule_id: 1, category_id: 1, quantity_threshold: 10, value_threshold: null, is_active: true }).mockResolvedValueOnce(null);
    const result = await service.resolveForIssue(1, 1, 9);
    expect(result.required).toBe(false);
  });

  it('requires approval once quantity * last purchase price meets the value threshold', async () => {
    mockPrisma.invApprovalRule.findFirst.mockResolvedValueOnce({ rule_id: 1, category_id: 1, quantity_threshold: null, value_threshold: 1000, is_active: true }).mockResolvedValueOnce(null);
    mockPrisma.invItemVendor.findFirst.mockResolvedValue({ last_purchase_price: 200 });

    const result = await service.resolveForIssue(1, 1, 5); // 5 * 200 = 1000
    expect(result.required).toBe(true);
  });
});
