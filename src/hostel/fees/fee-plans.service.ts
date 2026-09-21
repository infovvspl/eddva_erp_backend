import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAuditService } from '../common/hostel-audit.service';
import { HostelLookupService } from '../common/hostel-lookup.service';
import { HOSTEL_ENTITY } from '../common/hostel-entities';
import {
  buildMeta,
  parsePagination,
  parseSort,
  parseSortOrder,
} from '../common/pagination.util';
import {
  CreateHostelFeePlanDto,
  QueryHostelFeePlanDto,
  UpdateHostelFeePlanDto,
} from './dto/fee.dto';

const SORT_FIELDS = ['name', 'amount', 'room_type', 'created_at'] as const;

/**
 * Room-type fee plans. Changing a plan never touches invoices already issued:
 * an invoice copies the plan's terms when it is generated.
 */
@Injectable()
export class FeePlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: HostelLookupService,
    private readonly audit: HostelAuditService,
  ) {}

  /** Two live plans for the same room type / mess option / cycle would make invoice generation ambiguous. */
  private async assertNoActiveTwin(
    instituteId: string,
    plan: Pick<
      CreateHostelFeePlanDto,
      'room_type' | 'includes_mess' | 'billing_cycle'
    >,
    exceptId?: number,
  ) {
    const twin = await this.prisma.hostelFeePlan.findFirst({
      where: {
        institute_id: instituteId,
        deleted_at: null,
        is_active: true,
        room_type: plan.room_type,
        includes_mess: plan.includes_mess,
        billing_cycle: plan.billing_cycle,
        ...(exceptId ? { fee_plan_id: { not: exceptId } } : {}),
      },
      select: { fee_plan_id: true, name: true },
    });
    if (twin) {
      throw new ConflictException(
        `An active plan already covers ${plan.room_type} / ${plan.includes_mess ? 'with' : 'without'} mess / ${plan.billing_cycle}: "${twin.name}" (#${twin.fee_plan_id}). Deactivate it first.`,
      );
    }
  }

  async create(actor: HostelPlatformUser, dto: CreateHostelFeePlanDto) {
    const isActive = dto.is_active ?? true;
    if (isActive) await this.assertNoActiveTwin(actor.institute_id, dto);
    const plan = await this.prisma.hostelFeePlan.create({
      data: {
        institute_id: actor.institute_id,
        name: dto.name,
        room_type: dto.room_type,
        includes_mess: dto.includes_mess,
        amount: new Prisma.Decimal(dto.amount),
        billing_cycle: dto.billing_cycle,
        description: dto.description,
        is_active: isActive,
        created_by: actor.eddva_user_id,
      },
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.FEE_PLAN,
      entityId: String(plan.fee_plan_id),
      action: 'create',
      metadata: {
        amount: dto.amount,
        room_type: plan.room_type,
        billing_cycle: plan.billing_cycle,
      },
    });
    return plan;
  }

  async findAll(instituteId: string, query: QueryHostelFeePlanDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, 'room_type');
    const where: Prisma.HostelFeePlanWhereInput = {
      institute_id: instituteId,
      deleted_at: null,
      room_type: query.room_type,
      billing_cycle: query.billing_cycle,
      includes_mess: query.includes_mess,
      is_active: query.is_active,
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.hostelFeePlan.findMany({
        where,
        orderBy: { [sortBy]: parseSortOrder(query.sortOrder ?? 'asc') },
        skip,
        take,
      }),
      this.prisma.hostelFeePlan.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  findOne(instituteId: string, id: number) {
    return this.lookup.feePlan(instituteId, id);
  }

  async update(
    actor: HostelPlatformUser,
    id: number,
    dto: UpdateHostelFeePlanDto,
  ) {
    const before = await this.lookup.feePlan(actor.institute_id, id);
    const merged = {
      room_type: dto.room_type ?? before.room_type,
      includes_mess: dto.includes_mess ?? before.includes_mess,
      billing_cycle: dto.billing_cycle ?? before.billing_cycle,
    };
    const willBeActive = dto.is_active ?? before.is_active;
    if (willBeActive)
      await this.assertNoActiveTwin(actor.institute_id, merged, id);

    const updated = await this.prisma.hostelFeePlan.update({
      where: { fee_plan_id: id },
      data: {
        name: dto.name,
        room_type: dto.room_type,
        includes_mess: dto.includes_mess,
        amount:
          dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : undefined,
        billing_cycle: dto.billing_cycle,
        description: dto.description,
        is_active: dto.is_active,
      },
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.FEE_PLAN,
      entityId: String(id),
      action: dto.is_active === false ? 'deactivate' : 'update',
      metadata: {
        changes: dto,
        // Existing invoices keep the amount they were issued with.
        previous_amount: before.amount.toString(),
      },
    });
    return updated;
  }

  /** Soft delete; invoices already issued from this plan keep working. */
  async remove(actor: HostelPlatformUser, id: number) {
    await this.lookup.feePlan(actor.institute_id, id);
    await this.prisma.hostelFeePlan.update({
      where: { fee_plan_id: id },
      data: { deleted_at: new Date(), is_active: false },
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.FEE_PLAN,
      entityId: String(id),
      action: 'delete',
    });
    return { deleted: true };
  }
}
