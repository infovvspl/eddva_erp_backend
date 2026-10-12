import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { StaffAuditService } from '../common/staff-audit.service';
import { STAFF_ENTITY } from '../common/staff-entities';
import { StaffPlatformUser } from '../auth/staff-auth.service';
import { CreateStaffDepartmentDto } from './dto/create-department.dto';
import { UpdateStaffDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: StaffAuditService,
  ) {}

  async create(actor: StaffPlatformUser, dto: CreateStaffDepartmentDto) {
    const institute_id = requireInstituteId(actor.institute_id);
    const existing = await this.prisma.staffDepartment.findFirst({
      where: { name: dto.name, institute_id },
    });
    if (existing) throw new ConflictException(`Department "${dto.name}" already exists`);

    const department = await this.prisma.staffDepartment.create({
      data: { name: dto.name, description: dto.description, institute_id },
    });
    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.DEPARTMENT,
      entityId: String(department.department_id),
      action: 'create',
    });
    return department;
  }

  async findAll(instituteId: string, search?: string) {
    return this.prisma.staffDepartment.findMany({
      where: {
        institute_id: requireInstituteId(instituteId),
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: { _count: { select: { members: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const department = await this.prisma.staffDepartment.findFirst({
      where: { department_id: id, institute_id: requireInstituteId(instituteId) },
      include: { _count: { select: { members: true } } },
    });
    if (!department) throw new NotFoundException(`Department #${id} not found`);
    return department;
  }

  async update(actor: StaffPlatformUser, id: number, dto: UpdateStaffDepartmentDto) {
    const institute_id = requireInstituteId(actor.institute_id);
    const existing = await this.findOne(institute_id, id);

    if (dto.name && dto.name !== existing.name) {
      const clash = await this.prisma.staffDepartment.findFirst({ where: { name: dto.name, institute_id } });
      if (clash) throw new ConflictException(`Department "${dto.name}" already exists`);
    }

    const updated = await this.prisma.staffDepartment.update({
      where: { department_id: id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });

    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.DEPARTMENT,
      entityId: String(id),
      action: 'update',
    });
    return updated;
  }

  async remove(actor: StaffPlatformUser, id: number) {
    const institute_id = requireInstituteId(actor.institute_id);
    const department = await this.findOne(institute_id, id);
    if (department._count.members > 0) {
      throw new ConflictException(
        `Department "${department.name}" still has ${department._count.members} staff member(s). Move or relieve them before deleting the department.`,
      );
    }
    await this.prisma.staffDepartment.delete({ where: { department_id: id } });
    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.DEPARTMENT,
      entityId: String(id),
      action: 'delete',
    });
    return { success: true };
  }
}
