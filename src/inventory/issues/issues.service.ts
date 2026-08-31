import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryAuditService } from '../common/inventory-audit.service';
import { InventoryStockLedgerService } from '../common/inventory-stock-ledger.service';
import { INV_ENTITY } from '../common/inventory-entities';
import { ApprovalRulesService } from './approval-rules.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { RejectIssueDto } from './dto/reject-issue.dto';

const ACTIVE_ISSUE_STATUSES = ['issued', 'partially_returned', 'overdue'];

const ISSUE_DETAIL_INCLUDE = {
  item: { select: { item_id: true, name: true, item_code: true, item_type: true } },
  asset_unit: { select: { asset_unit_id: true, asset_tag: true, status: true } },
  holder: { select: { holder_id: true, name: true, holder_type: true } },
  source_location: { select: { location_id: true, name: true } },
  returns: { orderBy: { created_at: 'desc' as const } },
} as const;

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: InventoryAuditService,
    private readonly ledger: InventoryStockLedgerService,
    private readonly approvalRules: ApprovalRulesService,
  ) {}

  async create(dto: CreateIssueDto, actorId?: string) {
    const item = await this.prisma.invItem.findUnique({ where: { item_id: dto.item_id } });
    if (!item) throw new NotFoundException(`Item #${dto.item_id} not found`);

    const holder = await this.prisma.invHolder.findUnique({ where: { holder_id: dto.holder_id } });
    if (!holder) throw new NotFoundException(`Holder #${dto.holder_id} not found`);

    const sourceLocation = await this.prisma.invLocation.findUnique({ where: { location_id: dto.source_location_id } });
    if (!sourceLocation) throw new NotFoundException(`Location #${dto.source_location_id} not found`);

    const isAsset = item.item_type === 'asset';
    let assetUnit: any = null;
    let quantity = 1;

    if (isAsset) {
      if (!dto.asset_unit_id) {
        throw new BadRequestException(`Item "${item.name}" is individually tracked (item_type=asset) — asset_unit_id is required`);
      }
      assetUnit = await this.prisma.invAssetUnit.findUnique({ where: { asset_unit_id: dto.asset_unit_id } });
      if (!assetUnit) throw new NotFoundException(`Asset unit #${dto.asset_unit_id} not found`);
      if (assetUnit.item_id !== item.item_id) {
        throw new BadRequestException(`Asset unit #${dto.asset_unit_id} does not belong to item #${item.item_id}`);
      }
      if (assetUnit.status !== 'in_store') {
        throw new ConflictException(`Asset "${assetUnit.asset_tag}" is not available (current status: ${assetUnit.status})`);
      }
    } else {
      if (dto.asset_unit_id) {
        throw new BadRequestException(`Item "${item.name}" is a consumable — asset_unit_id must not be supplied`);
      }
      quantity = dto.quantity ?? 1;
    }

    const approval = await this.approvalRules.resolveForIssue(item.category_id, item.item_id, quantity);

    const issue = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invAssetIssue.create({
        data: {
          item_id: item.item_id,
          asset_unit_id: assetUnit?.asset_unit_id,
          quantity,
          holder_id: dto.holder_id,
          source_location_id: dto.source_location_id,
          issue_date: new Date(dto.issue_date),
          expected_return_date: dto.expected_return_date ? new Date(dto.expected_return_date) : undefined,
          status: approval.required ? 'pending_approval' : 'issued',
          approval_status: approval.required ? 'pending' : 'not_required',
          approval_rule_id: approval.rule_id,
          issued_by: actorId,
        },
      });

      if (!approval.required) {
        await this.dispense(tx, created.issue_id, item.item_id, dto.source_location_id, quantity, isAsset, assetUnit?.asset_unit_id, dto.holder_id, actorId);
      }

      return created;
    });

    await this.audit.log({
      userId: actorId,
      entityType: INV_ENTITY.ISSUE,
      entityId: String(issue.issue_id),
      action: approval.required ? 'create_pending_approval' : 'create',
      metadata: { item_id: item.item_id, asset_unit_id: assetUnit?.asset_unit_id, quantity, holder_id: dto.holder_id },
    });

    return this.findOne(issue.issue_id);
  }

  /** Decrements stock (consumables) or marks the asset issued — shared by create() (no approval needed) and approve(). */
  private async dispense(
    tx: any,
    issueId: number,
    itemId: number,
    locationId: number,
    quantity: number,
    isAsset: boolean,
    assetUnitId: number | undefined,
    holderId: number,
    actorId?: string,
  ) {
    if (isAsset) {
      // Conditional update (not a plain `update`) is the real concurrency
      // guarantee here — the earlier findUnique+status check in create()/
      // approve() is only a fast, friendly pre-check; without this WHERE
      // guard, two concurrent requests could both pass that check before
      // either commits and both mark the same asset issued. Mirrors the
      // ledger's "quantity >= n" atomic-decrement pattern.
      const result = await tx.invAssetUnit.updateMany({
        where: { asset_unit_id: assetUnitId, status: 'in_store' },
        data: { status: 'issued', current_holder_id: holderId, current_location_id: null },
      });
      if (result.count === 0) {
        throw new ConflictException(`Asset unit #${assetUnitId} is no longer available (already issued by a concurrent request)`);
      }
    } else {
      await this.ledger.decrement(tx, 'issue_out', {
        item_id: itemId,
        location_id: locationId,
        quantity,
        reference_type: 'issue',
        reference_id: issueId,
        issue_id: issueId,
        created_by: actorId,
      });
    }
  }

  async approve(id: number, actorId?: string) {
    const issue = await this.assertExists(id);
    if (issue.approval_status !== 'pending') {
      throw new ConflictException(`Issue #${id} is not pending approval (current: ${issue.approval_status})`);
    }

    const isAsset = !!issue.asset_unit_id;

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.dispense(tx, id, issue.item_id, issue.source_location_id, issue.quantity, isAsset, issue.asset_unit_id ?? undefined, issue.holder_id, actorId);
      return tx.invAssetIssue.update({
        where: { issue_id: id },
        data: { approval_status: 'approved', status: 'issued', approved_by: actorId, approved_at: new Date() },
      });
    });

    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.ISSUE, entityId: String(id), action: 'approve', oldStatus: 'pending', newStatus: 'approved' });
    return updated;
  }

  async reject(id: number, dto: RejectIssueDto, actorId?: string) {
    const issue = await this.assertExists(id);
    if (issue.approval_status !== 'pending') {
      throw new ConflictException(`Issue #${id} is not pending approval (current: ${issue.approval_status})`);
    }

    // Stock never moved for a pending-approval issue, so rejecting is a pure status change — no ledger entry to reverse.
    const updated = await this.prisma.invAssetIssue.update({
      where: { issue_id: id },
      data: { approval_status: 'rejected', status: 'rejected', rejection_reason: dto.rejection_reason },
    });

    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.ISSUE, entityId: String(id), action: 'reject', oldStatus: 'pending', newStatus: 'rejected', reason: dto.rejection_reason });
    return updated;
  }

  async returnIssue(id: number, dto: CreateReturnDto, actorId?: string) {
    const issue = await this.assertExists(id);
    if (!ACTIVE_ISSUE_STATUSES.includes(issue.status)) {
      throw new ConflictException(`Issue #${id} is not active (current status: ${issue.status}) and cannot be returned`);
    }

    const isAsset = !!issue.asset_unit_id;
    const returnDate = dto.return_date ? new Date(dto.return_date) : new Date();

    let quantityReturned: number;
    if (isAsset) {
      quantityReturned = 1;
    } else {
      quantityReturned = dto.quantity_returned ?? issue.quantity - issue.quantity_returned;
      const remaining = issue.quantity - issue.quantity_returned;
      if (quantityReturned > remaining) {
        throw new BadRequestException(`Cannot return ${quantityReturned} — only ${remaining} of issue #${id} remain outstanding`);
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const returnRecord = await tx.invAssetReturn.create({
        data: {
          issue_id: id,
          quantity_returned: quantityReturned,
          condition: dto.condition as any,
          remarks: dto.remarks,
          return_date: returnDate,
          received_by: actorId,
        },
      });

      if (isAsset) {
        const newStatus = dto.condition === 'good' ? 'in_store' : 'under_repair';
        await tx.invAssetUnit.update({
          where: { asset_unit_id: issue.asset_unit_id! },
          data: { status: newStatus, current_holder_id: null, current_location_id: issue.source_location_id },
        });

        if (dto.condition !== 'good') {
          await tx.invAssetMaintenance.create({
            data: {
              asset_unit_id: issue.asset_unit_id!,
              issue_reported: `Returned in ${dto.condition} condition${dto.remarks ? `: ${dto.remarks}` : ''}`,
              status: 'reported',
              created_by: actorId,
            },
          });
        }
      } else {
        await this.ledger.increment(tx, 'return_in', {
          item_id: issue.item_id,
          location_id: issue.source_location_id,
          quantity: quantityReturned,
          reference_type: 'return',
          reference_id: returnRecord.return_id,
          return_id: returnRecord.return_id,
          created_by: actorId,
        });
      }

      const newQuantityReturned = issue.quantity_returned + quantityReturned;
      const newStatus = newQuantityReturned >= issue.quantity ? 'returned' : 'partially_returned';
      const updatedIssue = await tx.invAssetIssue.update({
        where: { issue_id: id },
        data: { quantity_returned: newQuantityReturned, status: newStatus },
      });

      return { returnRecord, updatedIssue };
    });

    await this.audit.log({
      userId: actorId,
      entityType: INV_ENTITY.RETURN,
      entityId: String(result.returnRecord.return_id),
      action: 'create',
      metadata: { issue_id: id, quantity_returned: quantityReturned, condition: dto.condition },
    });

    return this.findOne(id);
  }

  async findAll(params: {
    item_id?: number;
    holder_id?: number;
    location_id?: number;
    status?: string;
    approval_status?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 25;

    const where: any = {};
    if (params.item_id) where.item_id = params.item_id;
    if (params.holder_id) where.holder_id = params.holder_id;
    if (params.location_id) where.source_location_id = params.location_id;
    if (params.status) where.status = params.status;
    if (params.approval_status) where.approval_status = params.approval_status;
    if (params.date_from || params.date_to) {
      where.issue_date = {};
      if (params.date_from) where.issue_date.gte = new Date(params.date_from);
      if (params.date_to) where.issue_date.lte = new Date(params.date_to);
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invAssetIssue.findMany({
        where,
        include: ISSUE_DETAIL_INCLUDE,
        orderBy: { issue_date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invAssetIssue.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const issue = await this.prisma.invAssetIssue.findUnique({ where: { issue_id: id }, include: ISSUE_DETAIL_INCLUDE });
    if (!issue) throw new NotFoundException(`Issue #${id} not found`);
    return issue;
  }

  private async assertExists(id: number) {
    const issue = await this.prisma.invAssetIssue.findUnique({ where: { issue_id: id } });
    if (!issue) throw new NotFoundException(`Issue #${id} not found`);
    return issue;
  }
}
