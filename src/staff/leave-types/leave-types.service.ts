import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { StaffAuditService } from '../common/staff-audit.service';
import { STAFF_ENTITY } from '../common/staff-entities';
import { StaffPlatformUser } from '../auth/staff-auth.service';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';

@Injectable()
export class LeaveTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: StaffAuditService,
  ) {}

  async create(actor: StaffPlatformUser, dto: CreateLeaveTypeDto) {
    const institute_id = requireInstituteId(actor.institute_id);
    const existing = await this.prisma.leaveType.findFirst({
      where: { code: dto.code, institute_id },
    });
    if (existing) throw new ConflictException(`A leave type with code "${dto.code}" already exists`);

    const leaveType = await this.prisma.leaveType.create({
      data: {
        institute_id,
        name: dto.name,
        code: dto.code,
        applicable_staff_type: dto.applicable_staff_type,
        annual_quota_days: dto.annual_quota_days,
        is_paid: dto.is_paid ?? true,
        allow_carry_forward: dto.allow_carry_forward ?? false,
        max_carry_forward_days: dto.max_carry_forward_days,
      },
    });

    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.LEAVE_TYPE,
      entityId: String(leaveType.leave_type_id),
      action: 'create',
    });
    return leaveType;
  }

  async findAll(instituteId: string, includeInactive = false) {
    return this.prisma.leaveType.findMany({
      where: {
        institute_id: requireInstituteId(instituteId),
        ...(includeInactive ? {} : { is_active: true }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const leaveType = await this.prisma.leaveType.findFirst({
      where: { leave_type_id: id, institute_id: requireInstituteId(instituteId) },
    });
    if (!leaveType) throw new NotFoundException(`Leave type #${id} not found`);
    return leaveType;
  }

  async update(actor: StaffPlatformUser, id: number, dto: UpdateLeaveTypeDto) {
    const institute_id = requireInstituteId(actor.institute_id);
    const existing = await this.findOne(institute_id, id);

    if (dto.code && dto.code !== existing.code) {
      const clash = await this.prisma.leaveType.findFirst({ where: { code: dto.code, institute_id } });
      if (clash) throw new ConflictException(`A leave type with code "${dto.code}" already exists`);
    }

    const updated = await this.prisma.leaveType.update({
      where: { leave_type_id: id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.applicable_staff_type !== undefined && { applicable_staff_type: dto.applicable_staff_type }),
        ...(dto.annual_quota_days !== undefined && { annual_quota_days: dto.annual_quota_days }),
        ...(dto.is_paid !== undefined && { is_paid: dto.is_paid }),
        ...(dto.allow_carry_forward !== undefined && { allow_carry_forward: dto.allow_carry_forward }),
        ...(dto.max_carry_forward_days !== undefined && { max_carry_forward_days: dto.max_carry_forward_days }),
        ...(dto.is_active !== undefined && { is_active: dto.is_active }),
      },
    });

    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.LEAVE_TYPE,
      entityId: String(id),
      action: 'update',
    });
    return updated;
  }

  /** Soft delete — deactivate rather than remove, so past balances keep their reference intact. */
  async remove(actor: StaffPlatformUser, id: number) {
    const institute_id = requireInstituteId(actor.institute_id);
    await this.findOne(institute_id, id);
    const updated = await this.prisma.leaveType.update({
      where: { leave_type_id: id },
      data: { is_active: false },
    });
    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.LEAVE_TYPE,
      entityId: String(id),
      action: 'deactivate',
    });
    return updated;
  }
}
