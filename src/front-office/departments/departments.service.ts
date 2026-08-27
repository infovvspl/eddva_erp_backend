import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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

  async create(dto: CreateDepartmentDto, actorId?: string) {
    const existing = await this.prisma.frontOfficeDepartment.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`Department "${dto.name}" already exists`);

    const department = await this.prisma.frontOfficeDepartment.create({ data: { name: dto.name } });
    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.DEPARTMENT,
      entityId: String(department.department_id),
      action: 'create',
      newStatus: department.status,
    });
    return department;
  }

  async findAll(search?: string) {
    return this.prisma.frontOfficeDepartment.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : undefined,
      include: { _count: { select: { employees: true, appointments: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const department = await this.prisma.frontOfficeDepartment.findUnique({
      where: { department_id: id },
      include: { employees: true },
    });
    if (!department) throw new NotFoundException(`Department #${id} not found`);
    return department;
  }

  async update(id: number, dto: UpdateDepartmentDto, actorId?: string) {
    const existing = await this.findOne(id);

    if (dto.name && dto.name !== existing.name) {
      const clash = await this.prisma.frontOfficeDepartment.findUnique({ where: { name: dto.name } });
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
