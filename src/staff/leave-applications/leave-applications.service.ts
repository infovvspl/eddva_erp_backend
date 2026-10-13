import { BadRequestException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { StaffAuditService } from '../common/staff-audit.service';
import { StaffNotificationService } from '../notifications/staff-notification.service';
import { STAFF_ENTITY } from '../common/staff-entities';
import { BusinessException } from '../common/business-exception';
import { buildMeta, parsePagination } from '../common/pagination.util';
import { StaffPlatformUser } from '../auth/staff-auth.service';
import { CreateLeaveApplicationDto } from './dto/create-leave-application.dto';
import { DecideLeaveApplicationDto } from './dto/decide-leave-application.dto';
import { QueryLeaveApplicationDto } from './dto/query-leave-application.dto';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Inclusive day count between two calendar dates. */
function inclusiveDayCount(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY) + 1;
}

@Injectable()
export class LeaveApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: StaffAuditService,
    private readonly notifications: StaffNotificationService,
  ) {}

  private async assertActiveStaff(instituteId: string, staffId: number) {
    const staff = await this.prisma.staffMember.findFirst({
      where: { staff_id: staffId, institute_id: instituteId },
    });
    if (!staff) throw new NotFoundException(`Staff member #${staffId} not found`);
    if (staff.status !== 'active') {
      throw new BusinessException(
        'STAFF_NOT_ACTIVE',
        `Staff member #${staffId} is ${staff.status} and cannot apply for leave`,
      );
    }
    return staff;
  }

  private async assertApplicableLeaveType(instituteId: string, leaveTypeId: number, staffType: string) {
    const leaveType = await this.prisma.leaveType.findFirst({
      where: { leave_type_id: leaveTypeId, institute_id: instituteId },
    });
    if (!leaveType) throw new NotFoundException(`Leave type #${leaveTypeId} not found`);
    if (!leaveType.is_active) {
      throw new BusinessException('LEAVE_TYPE_INACTIVE', `Leave type "${leaveType.name}" is no longer active`);
    }
    if (leaveType.applicable_staff_type !== null && leaveType.applicable_staff_type !== staffType) {
      throw new BusinessException(
        'LEAVE_TYPE_NOT_APPLICABLE',
        `Leave type "${leaveType.name}" does not apply to ${staffType} staff`,
      );
    }
    return leaveType;
  }

  async apply(actor: StaffPlatformUser, dto: CreateLeaveApplicationDto) {
    const institute_id = requireInstituteId(actor.institute_id);
    const staff = await this.assertActiveStaff(institute_id, dto.staff_id);
    const leaveType = await this.assertApplicableLeaveType(institute_id, dto.leave_type_id, staff.staff_type);

    const from_date = new Date(dto.from_date);
    const to_date = new Date(dto.to_date);
    if (to_date < from_date) {
      throw new BadRequestException('to_date cannot be before from_date');
    }
    if (dto.is_half_day && from_date.getTime() !== to_date.getTime()) {
      throw new BadRequestException('A half-day application must have the same from_date and to_date');
    }
    const days_count = dto.is_half_day ? 0.5 : inclusiveDayCount(from_date, to_date);

    const overlap = await this.prisma.leaveApplication.findFirst({
      where: {
        staff_id: dto.staff_id,
        status: { in: ['pending', 'approved'] },
        from_date: { lte: to_date },
        to_date: { gte: from_date },
      },
    });
    if (overlap) {
      throw new BusinessException(
        'LEAVE_DATES_OVERLAP',
        `Staff member #${dto.staff_id} already has a ${overlap.status} application (#${overlap.application_id}) covering part of this date range`,
        { conflicting_application_id: overlap.application_id },
        HttpStatus.CONFLICT,
      );
    }

    const year = from_date.getUTCFullYear();
    const balance = await this.prisma.leaveBalance.findUnique({
      where: { staff_id_leave_type_id_year: { staff_id: dto.staff_id, leave_type_id: dto.leave_type_id, year } },
    });
    if (!balance) {
      throw new BusinessException(
        'NO_LEAVE_BALANCE',
        `No leave balance has been allocated for "${leaveType.name}" in ${year}. Trigger POST /api/staff/leave-balances/sync first.`,
      );
    }
    const available = Number(balance.allocated_days) - Number(balance.used_days);
    if (days_count > available) {
      throw new BusinessException(
        'LEAVE_BALANCE_EXCEEDED',
        `This application needs ${days_count} day(s), but only ${available} day(s) of "${leaveType.name}" remain for ${year}`,
        { requested_days: days_count, available_days: available },
        HttpStatus.CONFLICT,
      );
    }

    const application = await this.prisma.leaveApplication.create({
      data: {
        institute_id,
        staff_id: dto.staff_id,
        leave_type_id: dto.leave_type_id,
        from_date,
        to_date,
        days_count,
        is_half_day: !!dto.is_half_day,
        half_day_period: dto.is_half_day ? dto.half_day_period : undefined,
        reason: dto.reason,
        applied_by: actor.eddva_user_id,
      },
    });

    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.LEAVE_APPLICATION,
      entityId: String(application.application_id),
      action: 'apply',
      newStatus: application.status,
    });

    await this.notifications.notify({
      instituteId: institute_id,
      entityType: STAFF_ENTITY.LEAVE_APPLICATION,
      entityId: application.application_id,
      eventType: 'leave_application_submitted',
      message: `${staff.full_name} applied for ${days_count} day(s) of ${leaveType.name} (${dto.from_date} to ${dto.to_date})`,
    });

    return application;
  }

  async findAll(instituteId: string, query: QueryLeaveApplicationDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const institute_id = requireInstituteId(instituteId);
    const where = {
      institute_id,
      staff_id: query.staff_id,
      leave_type_id: query.leave_type_id,
      status: query.status,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.leaveApplication.findMany({
        where,
        include: {
          staff: { select: { staff_id: true, full_name: true, staff_code: true } },
          leave_type: { select: { leave_type_id: true, name: true, code: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.leaveApplication.count({ where }),
    ]);

    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const application = await this.prisma.leaveApplication.findFirst({
      where: { application_id: id, institute_id: requireInstituteId(instituteId) },
      include: { staff: true, leave_type: true },
    });
    if (!application) throw new NotFoundException(`Leave application #${id} not found`);
    return application;
  }

  private assertPending(application: { status: string; application_id: number }) {
    if (application.status !== 'pending') {
      throw new BusinessException(
        'LEAVE_APPLICATION_NOT_PENDING',
        `Leave application #${application.application_id} is ${application.status}, not pending`,
        undefined,
        HttpStatus.CONFLICT,
      );
    }
  }

  async approve(actor: StaffPlatformUser, id: number) {
    const institute_id = requireInstituteId(actor.institute_id);
    const application = await this.findOne(institute_id, id);
    this.assertPending(application);

    const year = application.from_date.getUTCFullYear();
    const balance = await this.prisma.leaveBalance.findUnique({
      where: {
        staff_id_leave_type_id_year: {
          staff_id: application.staff_id,
          leave_type_id: application.leave_type_id,
          year,
        },
      },
    });
    if (!balance) {
      throw new BusinessException('NO_LEAVE_BALANCE', `No leave balance found for ${year} — cannot approve`);
    }
    const available = Number(balance.allocated_days) - Number(balance.used_days);
    const days_count = Number(application.days_count);
    if (days_count > available) {
      throw new BusinessException(
        'LEAVE_BALANCE_EXCEEDED',
        `Only ${available} day(s) remain for "${application.leave_type.name}" in ${year} — the balance has changed since this application was filed`,
        { requested_days: days_count, available_days: available },
        HttpStatus.CONFLICT,
      );
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.leaveApplication.update({
        where: { application_id: id },
        data: { status: 'approved', decided_by: actor.eddva_user_id, decided_at: new Date() },
      }),
      this.prisma.leaveBalance.update({
        where: { balance_id: balance.balance_id },
        data: { used_days: { increment: days_count } },
      }),
    ]);

    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.LEAVE_APPLICATION,
      entityId: String(id),
      action: 'approve',
      oldStatus: 'pending',
      newStatus: updated.status,
    });

    await this.notifications.notify(
      {
        instituteId: institute_id,
        entityType: STAFF_ENTITY.LEAVE_APPLICATION,
        entityId: id,
        eventType: 'leave_application_approved',
        message: `Leave application #${id} was approved`,
      },
      [application.applied_by],
    );

    return updated;
  }

  async reject(actor: StaffPlatformUser, id: number, dto: DecideLeaveApplicationDto) {
    const institute_id = requireInstituteId(actor.institute_id);
    const application = await this.findOne(institute_id, id);
    this.assertPending(application);

    const updated = await this.prisma.leaveApplication.update({
      where: { application_id: id },
      data: {
        status: 'rejected',
        decided_by: actor.eddva_user_id,
        decided_at: new Date(),
        decision_reason: dto.decision_reason,
      },
    });

    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.LEAVE_APPLICATION,
      entityId: String(id),
      action: 'reject',
      oldStatus: 'pending',
      newStatus: updated.status,
      reason: dto.decision_reason,
    });

    await this.notifications.notify(
      {
        instituteId: institute_id,
        entityType: STAFF_ENTITY.LEAVE_APPLICATION,
        entityId: id,
        eventType: 'leave_application_rejected',
        message: `Leave application #${id} was rejected${dto.decision_reason ? `: ${dto.decision_reason}` : ''}`,
      },
      [application.applied_by],
    );

    return updated;
  }

  /** Cancel a pending application, or an approved one that hasn't started yet (reverses the balance deduction). */
  async cancel(actor: StaffPlatformUser, id: number) {
    const institute_id = requireInstituteId(actor.institute_id);
    const application = await this.findOne(institute_id, id);

    if (application.status === 'rejected' || application.status === 'cancelled') {
      throw new BusinessException(
        'LEAVE_APPLICATION_NOT_PENDING',
        `Leave application #${id} is already ${application.status}`,
        undefined,
        HttpStatus.CONFLICT,
      );
    }
    if (application.status === 'approved') {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      if (application.from_date <= today) {
        throw new BusinessException(
          'LEAVE_ALREADY_STARTED',
          `Leave application #${id} has already started and cannot be cancelled`,
          undefined,
          HttpStatus.CONFLICT,
        );
      }

      const year = application.from_date.getUTCFullYear();
      const balance = await this.prisma.leaveBalance.findUnique({
        where: {
          staff_id_leave_type_id_year: {
            staff_id: application.staff_id,
            leave_type_id: application.leave_type_id,
            year,
          },
        },
      });
      if (balance) {
        await this.prisma.leaveBalance.update({
          where: { balance_id: balance.balance_id },
          data: { used_days: { decrement: Number(application.days_count) } },
        });
      }
    }

    const updated = await this.prisma.leaveApplication.update({
      where: { application_id: id },
      data: { status: 'cancelled', decided_by: actor.eddva_user_id, decided_at: new Date() },
    });

    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.LEAVE_APPLICATION,
      entityId: String(id),
      action: 'cancel',
      oldStatus: application.status,
      newStatus: updated.status,
    });

    return updated;
  }
}
