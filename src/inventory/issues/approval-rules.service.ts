import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { CreateApprovalRuleDto } from './dto/create-approval-rule.dto';

export interface ApprovalDecision {
  required: boolean;
  rule_id?: number;
}

@Injectable()
export class ApprovalRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(instituteId: string, dto: CreateApprovalRuleDto) {
    const institute_id = requireInstituteId(instituteId);
    if (dto.category_id) {
      const category = await this.prisma.invCategory.findFirst({ where: { category_id: dto.category_id, institute_id } });
      if (!category) throw new NotFoundException(`Category #${dto.category_id} not found`);
    }
    return this.prisma.invApprovalRule.create({
      data: {
        institute_id,
        category_id: dto.category_id,
        value_threshold: dto.value_threshold,
        quantity_threshold: dto.quantity_threshold,
        is_active: dto.is_active ?? true,
      },
    });
  }

  async findAll(instituteId: string) {
    return this.prisma.invApprovalRule.findMany({
      where: { institute_id: requireInstituteId(instituteId) },
      include: { category: { select: { category_id: true, name: true } } },
      orderBy: { rule_id: 'asc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const rule = await this.prisma.invApprovalRule.findFirst({ where: { rule_id: id, institute_id: requireInstituteId(instituteId) } });
    if (!rule) throw new NotFoundException(`Approval rule #${id} not found`);
    return rule;
  }

  /**
   * Category-specific active rule takes precedence over a global (category_id
   * null) one. An issue requires approval if the requested quantity or its
   * value (quantity * the item's last recorded purchase price) meets or
   * exceeds the matching rule's threshold.
   */
  async resolveForIssue(instituteId: string, categoryId: number, itemId: number, quantity: number): Promise<ApprovalDecision> {
    const institute_id = requireInstituteId(instituteId);
    const [specific, global] = await Promise.all([
      this.prisma.invApprovalRule.findFirst({ where: { is_active: true, category_id: categoryId, institute_id } }),
      this.prisma.invApprovalRule.findFirst({ where: { is_active: true, category_id: null, institute_id } }),
    ]);
    const rule = specific ?? global;
    if (!rule) return { required: false };

    let value = 0;
    if (rule.value_threshold != null) {
      const priceRow = await this.prisma.invItemVendor.findFirst({
        where: { item_id: itemId },
        orderBy: { updated_at: 'desc' },
      });
      value = priceRow?.last_purchase_price ? Number(priceRow.last_purchase_price) * quantity : 0;
    }

    const exceedsValue = rule.value_threshold != null && value >= Number(rule.value_threshold);
    const exceedsQuantity = rule.quantity_threshold != null && quantity >= rule.quantity_threshold;

    return { required: exceedsValue || exceedsQuantity, rule_id: rule.rule_id };
  }
}
