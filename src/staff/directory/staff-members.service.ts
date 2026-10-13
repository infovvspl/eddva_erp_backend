import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { StaffAuditService } from '../common/staff-audit.service';
import { StaffNumberingService } from '../common/staff-numbering.service';
import { STAFF_ENTITY } from '../common/staff-entities';
import { buildMeta, parsePagination } from '../common/pagination.util';
import { StaffPlatformUser } from '../auth/staff-auth.service';
import { CreateStaffMemberDto } from './dto/create-staff-member.dto';
import { UpdateStaffMemberDto } from './dto/update-staff-member.dto';
import { QueryStaffMemberDto } from './dto/query-staff-member.dto';
import { RelieveStaffMemberDto, ReinstateStaffMemberDto } from './dto/relieve-staff-member.dto';
import { ImportLmsTeacherDto } from './dto/import-lms-teacher.dto';
import { LeaveBalancesService } from '../leave-balances/leave-balances.service';
import { StaffLmsSyncService } from '../lms-sync/staff-lms-sync.service';

@Injectable()
export class StaffMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: StaffAuditService,
    private readonly numbering: StaffNumberingService,
    private readonly leaveBalances: LeaveBalancesService,
    private readonly lmsSync: StaffLmsSyncService,
  ) {}

  private async assertDepartmentExists(instituteId: string, departmentId: number) {
    const dept = await this.prisma.staffDepartment.findFirst({
      where: { department_id: departmentId, institute_id: instituteId },
    });
    if (!dept) throw new NotFoundException(`Department #${departmentId} not found`);
    return dept;
  }

  private async assertReportingManagerExists(instituteId: string, staffId: number) {
    const manager = await this.prisma.staffMember.findFirst({
      where: { staff_id: staffId, institute_id: instituteId },
    });
    if (!manager) throw new NotFoundException(`Reporting manager (staff #${staffId}) not found`);
    return manager;
  }

  async create(actor: StaffPlatformUser, dto: CreateStaffMemberDto) {
    const institute_id = requireInstituteId(actor.institute_id);
    if (dto.department_id) {
      await this.assertDepartmentExists(institute_id, dto.department_id);
    }
    if (dto.reporting_to_id) {
      await this.assertReportingManagerExists(institute_id, dto.reporting_to_id);
    }
    if (dto.email) {
      const clash = await this.prisma.staffMember.findFirst({ where: { email: dto.email, institute_id } });
      if (clash) throw new ConflictException(`A staff member with email "${dto.email}" already exists`);
    }

    const staff_code = await this.numbering.next('STAFF');

    const member = await this.prisma.staffMember.create({
      data: {
        institute_id,
        staff_code,
        staff_type: dto.staff_type,
        full_name: dto.full_name,
        department_id: dto.department_id,
        designation: dto.designation,
        employment_type: dto.employment_type,
        email: dto.email,
        phone: dto.phone,
        date_of_joining: new Date(dto.date_of_joining),
        reporting_to_id: dto.reporting_to_id,
        created_by: actor.eddva_user_id,
      },
    });

    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.MEMBER,
      entityId: String(member.staff_id),
      action: 'create',
      newStatus: member.status,
    });

    await this.leaveBalances.ensureBalancesForStaffMember(institute_id, member.staff_id, member.staff_type);

    if (member.staff_type === 'teaching') {
      this.lmsSync.trigger(member.staff_id);
    }

    return member;
  }

  /**
   * Creates a staff record for a teacher that already exists in the LMS
   * (predates this integration, or was created directly there). Unlike
   * `create()`, the staff_code is the LMS's own employee_id — not a freshly
   * minted STF/... number — so every future department/status push resolves
   * to the same LMS teacher via that shared identifier. The link is recorded
   * as already `synced`: there is nothing left to push, the LMS record
   * already exists.
   */
  async importFromLms(actor: StaffPlatformUser, dto: ImportLmsTeacherDto) {
    const institute_id = requireInstituteId(actor.institute_id);

    const existingByCode = await this.prisma.staffMember.findFirst({
      where: { staff_code: dto.employee_id, institute_id },
    });
    if (existingByCode) {
      if (existingByCode.lms_teacher_ref && existingByCode.lms_teacher_ref !== dto.teacher_id) {
        throw new ConflictException(
          `Employee ID "${dto.employee_id}" is already used by a different LMS teacher (staff member #${existingByCode.staff_id}, "${existingByCode.full_name}"). This employee ID is shared by more than one teacher in the LMS — fix the duplicate there before importing.`,
        );
      }
      throw new ConflictException(`Staff member #${existingByCode.staff_id} is already linked to this LMS teacher`);
    }
    if (dto.department_id) {
      await this.assertDepartmentExists(institute_id, dto.department_id);
    }
    const emailClash = await this.prisma.staffMember.findFirst({ where: { email: dto.email, institute_id } });
    if (emailClash) throw new ConflictException(`A staff member with email "${dto.email}" already exists`);

    const member = await this.prisma.staffMember.create({
      data: {
        institute_id,
        staff_code: dto.employee_id,
        staff_type: 'teaching',
        full_name: dto.full_name,
        department_id: dto.department_id,
        designation: dto.designation?.trim() || 'Teacher',
        email: dto.email,
        date_of_joining: dto.date_of_joining ? new Date(dto.date_of_joining) : new Date(),
        created_by: actor.eddva_user_id,
        lms_teacher_ref: dto.teacher_id,
        lms_sync_status: 'synced',
      },
    });

    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.MEMBER,
      entityId: String(member.staff_id),
      action: 'import_from_lms',
      newStatus: member.status,
      metadata: { lms_teacher_id: dto.teacher_id },
    });

    await this.leaveBalances.ensureBalancesForStaffMember(institute_id, member.staff_id, member.staff_type);

    return member;
  }

  async findAll(instituteId: string, query: QueryStaffMemberDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const institute_id = requireInstituteId(instituteId);
    const where = {
      institute_id,
      staff_type: query.staff_type,
      status: query.status,
      department_id: query.department_id,
      ...(query.search
        ? {
            OR: [
              { full_name: { contains: query.search, mode: 'insensitive' as const } },
              { staff_code: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.staffMember.findMany({
        where,
        include: { department: true },
        orderBy: { full_name: 'asc' },
        skip,
        take,
      }),
      this.prisma.staffMember.count({ where }),
    ]);

    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const member = await this.prisma.staffMember.findFirst({
      where: { staff_id: id, institute_id: requireInstituteId(instituteId) },
      include: { department: true, reporting_to: true },
    });
    if (!member) throw new NotFoundException(`Staff member #${id} not found`);
    return member;
  }

  async update(actor: StaffPlatformUser, id: number, dto: UpdateStaffMemberDto) {
    const institute_id = requireInstituteId(actor.institute_id);
    const existing = await this.findOne(institute_id, id);

    let newDepartment: { name: string } | undefined;
    if (dto.department_id) {
      newDepartment = await this.assertDepartmentExists(institute_id, dto.department_id);
    }
    if (dto.reporting_to_id) {
      if (dto.reporting_to_id === id) {
        throw new BadRequestException('A staff member cannot report to themselves');
      }
      await this.assertReportingManagerExists(institute_id, dto.reporting_to_id);
    }
    if (dto.email && dto.email !== existing.email) {
      const clash = await this.prisma.staffMember.findFirst({ where: { email: dto.email, institute_id } });
      if (clash) throw new ConflictException(`A staff member with email "${dto.email}" already exists`);
    }

    const updated = await this.prisma.staffMember.update({
      where: { staff_id: id },
      data: {
        ...(dto.full_name !== undefined && { full_name: dto.full_name }),
        ...(dto.department_id !== undefined && { department_id: dto.department_id }),
        ...(dto.designation !== undefined && { designation: dto.designation }),
        ...(dto.employment_type !== undefined && { employment_type: dto.employment_type }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.date_of_joining !== undefined && { date_of_joining: new Date(dto.date_of_joining) }),
        ...(dto.reporting_to_id !== undefined && { reporting_to_id: dto.reporting_to_id }),
      },
    });

    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.MEMBER,
      entityId: String(id),
      action: 'update',
    });

    if (newDepartment && existing.staff_type === 'teaching' && dto.department_id !== existing.department_id) {
      this.lmsSync.pushDepartment(id, newDepartment.name).catch(() => undefined);
    }

    return updated;
  }

  /** Relieve a staff member (resignation/termination). They stop reporting to anyone new, but history is kept. */
  async relieve(actor: StaffPlatformUser, id: number, dto: RelieveStaffMemberDto) {
    const institute_id = requireInstituteId(actor.institute_id);
    const existing = await this.findOne(institute_id, id);
    if (existing.status !== 'active') {
      throw new ConflictException(`Staff member #${id} is already ${existing.status}`);
    }

    const updated = await this.prisma.staffMember.update({
      where: { staff_id: id },
      data: {
        status: dto.status,
        status_reason: dto.status_reason,
        relieved_on: new Date(dto.relieved_on),
      },
    });

    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.MEMBER,
      entityId: String(id),
      action: 'relieve',
      oldStatus: existing.status,
      newStatus: updated.status,
      reason: dto.status_reason,
    });

    if (existing.staff_type === 'teaching') {
      this.lmsSync.pushStatus(id, 'INACTIVE').catch(() => undefined);
    }

    return updated;
  }

  /** Reinstate a previously relieved staff member (re-hire). */
  async reinstate(actor: StaffPlatformUser, id: number, dto: ReinstateStaffMemberDto) {
    const institute_id = requireInstituteId(actor.institute_id);
    const existing = await this.findOne(institute_id, id);
    if (existing.status === 'active') {
      throw new ConflictException(`Staff member #${id} is already active`);
    }

    const updated = await this.prisma.staffMember.update({
      where: { staff_id: id },
      data: {
        status: 'active',
        status_reason: null,
        relieved_on: null,
        date_of_joining: new Date(dto.date_of_joining),
      },
    });

    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.MEMBER,
      entityId: String(id),
      action: 'reinstate',
      oldStatus: existing.status,
      newStatus: updated.status,
    });

    await this.leaveBalances.ensureBalancesForStaffMember(institute_id, id, updated.staff_type);

    if (updated.staff_type === 'teaching') {
      this.lmsSync.pushStatus(id, 'ACTIVE').catch(() => undefined);
    }

    return updated;
  }
}
