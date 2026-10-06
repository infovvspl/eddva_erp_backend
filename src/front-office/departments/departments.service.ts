import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { FrontOfficeAuditService } from '../common/front-office-audit.service';
import { FO_ENTITY } from '../common/front-office-entities';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FrontOfficeAuditService,
  ) {}

  async create(instituteId: string, dto: CreateDepartmentDto, actorId?: string) {
    const institute_id = requireInstituteId(instituteId);
    const existing = await this.prisma.frontOfficeDepartment.findFirst({ where: { name: dto.name, institute_id } });
    if (existing) throw new ConflictException(`Department "${dto.name}" already exists`);

    const department = await this.prisma.frontOfficeDepartment.create({ data: { name: dto.name, institute_id } });
    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.DEPARTMENT,
      entityId: String(department.department_id),
      action: 'create',
      newStatus: department.status,
    });
    return department;
  }

  async findAll(instituteId: string, search?: string) {
    return this.prisma.frontOfficeDepartment.findMany({
      where: { institute_id: requireInstituteId(instituteId), ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}) },
      include: { _count: { select: { employees: true, appointments: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const department = await this.prisma.frontOfficeDepartment.findFirst({
      where: { department_id: id, institute_id: requireInstituteId(instituteId) },
      include: { employees: true },
    });
    if (!department) throw new NotFoundException(`Department #${id} not found`);
    return department;
  }

  async update(instituteId: string, id: number, dto: UpdateDepartmentDto, actorId?: string) {
    const institute_id = requireInstituteId(instituteId);
    const existing = await this.findOne(institute_id, id);

    if (dto.name && dto.name !== existing.name) {
      const clash = await this.prisma.frontOfficeDepartment.findFirst({ where: { name: dto.name, institute_id } });
      if (clash) throw new ConflictException(`Department "${dto.name}" already exists`);
    }

    const updated = await this.prisma.frontOfficeDepartment.update({
      where: { department_id: id },
      data: { name: dto.name, status: dto.status as any },
    });

    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.DEPARTMENT,
      entityId: String(id),
      action: 'update',
      oldStatus: existing.status,
      newStatus: updated.status,
    });
    return updated;
  }
}
