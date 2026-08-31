import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { IssuesService } from './issues.service';
import { ApprovalRulesService } from './approval-rules.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryAuditService } from '../common/inventory-audit.service';
import { InventoryStockLedgerService } from '../common/inventory-stock-ledger.service';

describe('IssuesService', () => {
  let service: IssuesService;

  const tx = {
    invAssetIssue: { create: jest.fn(), update: jest.fn() },
    invAssetUnit: { updateMany: jest.fn() },
    invAssetReturn: { create: jest.fn() },
  };

  const mockPrisma = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    invItem: { findUnique: jest.fn() },
    invHolder: { findUnique: jest.fn() },
    invLocation: { findUnique: jest.fn() },
    invAssetUnit: { findUnique: jest.fn() },
    invAssetIssue: { findUnique: jest.fn() },
  };

  const mockAudit = { log: jest.fn() };
  const mockLedger = { increment: jest.fn(), decrement: jest.fn() };
  const mockApprovalRules = { resolveForIssue: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockApprovalRules.resolveForIssue.mockResolvedValue({ required: false });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssuesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InventoryAuditService, useValue: mockAudit },
        { provide: InventoryStockLedgerService, useValue: mockLedger },
        { provide: ApprovalRulesService, useValue: mockApprovalRules },
      ],
    }).compile();

    service = module.get(IssuesService);
    jest.spyOn(service, 'findOne').mockResolvedValue({ issue_id: 1 } as any);
  });

  describe('create — consumables', () => {
    const item = { item_id: 1, item_type: 'consumable', category_id: 1, name: 'Paper' };
    const holder = { holder_id: 1 };
    const location = { location_id: 1 };

    beforeEach(() => {
      mockPrisma.invItem.findUnique.mockResolvedValue(item);
      mockPrisma.invHolder.findUnique.mockResolvedValue(holder);
      mockPrisma.invLocation.findUnique.mockResolvedValue(location);
      tx.invAssetIssue.create.mockResolvedValue({ issue_id: 1 });
    });

    it('rejects supplying asset_unit_id for a consumable item', async () => {
      await expect(
        service.create({ item_id: 1, asset_unit_id: 5, holder_id: 1, source_location_id: 1, issue_date: '2026-08-29' } as any, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('dispenses immediately (decrements stock) when no approval is required', async () => {
      await service.create({ item_id: 1, quantity: 10, holder_id: 1, source_location_id: 1, issue_date: '2026-08-29' } as any, 'user-1');

      expect(mockLedger.decrement).toHaveBeenCalledWith(tx, 'issue_out', expect.objectContaining({ item_id: 1, location_id: 1, quantity: 10 }));
      expect(tx.invAssetIssue.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'issued', approval_status: 'not_required' }) }));
    });

    it('holds the issue pending approval and does NOT touch stock when a rule is exceeded', async () => {
      mockApprovalRules.resolveForIssue.mockResolvedValue({ required: true, rule_id: 9 });

      await service.create({ item_id: 1, quantity: 100, holder_id: 1, source_location_id: 1, issue_date: '2026-08-29' } as any, 'user-1');

      expect(mockLedger.decrement).not.toHaveBeenCalled();
      expect(tx.invAssetIssue.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'pending_approval', approval_status: 'pending', approval_rule_id: 9 }) }),
      );
    });
  });

  describe('create — assets', () => {
    const item = { item_id: 2, item_type: 'asset', category_id: 1, name: 'Laptop' };

    beforeEach(() => {
      mockPrisma.invItem.findUnique.mockResolvedValue(item);
      mockPrisma.invHolder.findUnique.mockResolvedValue({ holder_id: 1 });
      mockPrisma.invLocation.findUnique.mockResolvedValue({ location_id: 1 });
      tx.invAssetIssue.create.mockResolvedValue({ issue_id: 2 });
    });

    it('requires asset_unit_id for an asset item', async () => {
      await expect(
        service.create({ item_id: 2, holder_id: 1, source_location_id: 1, issue_date: '2026-08-29' } as any, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects issuing an asset unit that is not in_store', async () => {
      mockPrisma.invAssetUnit.findUnique.mockResolvedValue({ asset_unit_id: 9, item_id: 2, status: 'issued' });

      await expect(
        service.create({ item_id: 2, asset_unit_id: 9, holder_id: 1, source_location_id: 1, issue_date: '2026-08-29' } as any, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('uses a guarded updateMany (not a plain update) so a concurrent issue of the same asset is rejected', async () => {
      mockPrisma.invAssetUnit.findUnique.mockResolvedValue({ asset_unit_id: 9, item_id: 2, status: 'in_store' });
      tx.invAssetUnit.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.create({ item_id: 2, asset_unit_id: 9, holder_id: 1, source_location_id: 1, issue_date: '2026-08-29' } as any, 'user-1'),
      ).rejects.toThrow(ConflictException);

      expect(tx.invAssetUnit.updateMany).toHaveBeenCalledWith({
        where: { asset_unit_id: 9, status: 'in_store' },
        data: expect.objectContaining({ status: 'issued' }),
      });
    });
  });

  describe('approve / reject', () => {
    it('rejects approving an issue that is not pending', async () => {
      mockPrisma.invAssetIssue.findUnique.mockResolvedValue({ issue_id: 1, approval_status: 'approved' });
      await expect(service.approve(1, 'user-1')).rejects.toThrow(ConflictException);
    });

    it('dispenses stock only at approval time, not before', async () => {
      mockPrisma.invAssetIssue.findUnique.mockResolvedValue({
        issue_id: 1,
        approval_status: 'pending',
        item_id: 1,
        source_location_id: 1,
        quantity: 50,
        holder_id: 1,
        asset_unit_id: null,
      });
      tx.invAssetIssue.update.mockResolvedValue({ issue_id: 1, status: 'issued' });

      await service.approve(1, 'user-1');

      expect(mockLedger.decrement).toHaveBeenCalledWith(tx, 'issue_out', expect.objectContaining({ item_id: 1, quantity: 50 }));
    });

    it('rejecting a pending issue never calls the ledger', async () => {
      mockPrisma.invAssetIssue.findUnique.mockResolvedValue({ issue_id: 1, approval_status: 'pending' });
      const updateSpy = jest.fn().mockResolvedValue({ issue_id: 1, status: 'rejected' });
      (mockPrisma as any).invAssetIssue.update = updateSpy;

      await service.reject(1, { rejection_reason: 'no budget' }, 'user-1');

      expect(mockLedger.decrement).not.toHaveBeenCalled();
      expect(mockLedger.increment).not.toHaveBeenCalled();
    });
  });

  describe('returnIssue', () => {
    it('rejects returning more than the outstanding quantity', async () => {
      mockPrisma.invAssetIssue.findUnique.mockResolvedValue({
        issue_id: 1,
        status: 'issued',
        quantity: 10,
        quantity_returned: 8,
        asset_unit_id: null,
      });

      await expect(service.returnIssue(1, { quantity_returned: 5, condition: 'good' } as any, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects returning an issue that is already fully returned', async () => {
      mockPrisma.invAssetIssue.findUnique.mockResolvedValue({ issue_id: 1, status: 'returned' });
      await expect(service.returnIssue(1, { condition: 'good' } as any, 'user-1')).rejects.toThrow(ConflictException);
    });
  });
});
