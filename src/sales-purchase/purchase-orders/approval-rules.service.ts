import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';
import { SP_ENTITY } from '../common/sales-purchase-entities';
import {
  CreateApprovalRuleDto,
  UpdateApprovalRuleDto,
} from './dto/approval-rule.dto';

/**
 * Configurable PO approval thresholds (module spec §21) — amount bands
 * optionally tied to a required approver role. Never hardcoded: PoWorkflow
 * consults `resolveRequiredRules` at submit/approve time.
 */
@Injectable()
export class ApprovalRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SalesPurchaseAuditService,
  ) {}

  async create(
    instituteId: string,
    dto: CreateApprovalRuleDto,
    actorId?: string,
  ) {
    const rule = await this.prisma.spApprovalRule.create({
      data: {
        institute_id: instituteId,
        name: dto.name,
        min_amount: dto.min_amount,
        max_amount: dto.max_amount,
        approver_role_id: dto.approver_role_id,
        sequence: dto.sequence ?? 1,
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PO_APPROVAL_RULE,
      entityId: String(rule.rule_id),
      action: 'create',
    });
    return rule;
  }

  async findAll(instituteId: string) {
    return this.prisma.spApprovalRule.findMany({
      where: { institute_id: instituteId },
      include: { approver_role: { select: { role_id: true, name: true } } },
      orderBy: [{ min_amount: 'asc' }, { sequence: 'asc' }],
    });
  }

  async findOne(instituteId: string, id: number) {
    const rule = await this.prisma.spApprovalRule.findFirst({
      where: { rule_id: id, institute_id: instituteId },
    });
    if (!rule) throw new NotFoundException(`Approval rule #${id} not found`);
    return rule;
  }

  async update(
    instituteId: string,
    id: number,
    dto: UpdateApprovalRuleDto,
    actorId?: string,
  ) {
    await this.findOne(instituteId, id);
    const updated = await this.prisma.spApprovalRule.update({
      where: { rule_id: id },
      data: {
        name: dto.name,
        min_amount: dto.min_amount,
        max_amount: dto.max_amount,
        approver_role_id: dto.approver_role_id,
        sequence: dto.sequence,
        is_active: dto.is_active,
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PO_APPROVAL_RULE,
      entityId: String(id),
      action: 'update',
    });
    return updated;
  }

  async remove(instituteId: string, id: number, actorId?: string) {
    await this.findOne(instituteId, id);
    await this.prisma.spApprovalRule.delete({ where: { rule_id: id } });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PO_APPROVAL_RULE,
      entityId: String(id),
      action: 'delete',
    });
    return { success: true };
  }

  /** All active rule bands that apply to `amount`, ordered by sequence — the approval chain a PO of this size must satisfy. */
  async resolveRequiredRules(instituteId: string, amount: number) {
    return this.prisma.spApprovalRule.findMany({
      where: {
        institute_id: instituteId,
        is_active: true,
        min_amount: { lte: amount },
        OR: [{ max_amount: null }, { max_amount: { gte: amount } }],
      },
      orderBy: { sequence: 'asc' },
    });
  }
}
