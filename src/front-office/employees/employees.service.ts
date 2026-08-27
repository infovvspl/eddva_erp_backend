import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FrontOfficeAuditService } from '../common/front-office-audit.service';
import { FO_ENTITY } from '../common/front-office-entities';
import { combineDateAndTime } from '../common/time.util';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CreateAvailabilitySlotDto } from './dto/create-availability-slot.dto';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FrontOfficeAuditService,
  ) {}

  private async assertDepartmentExists(departmentId: number) {
    const dept = await this.prisma.frontOfficeDepartment.findUnique({ where: { department_id: departmentId } });
    if (!dept) throw new NotFoundException(`Department #${departmentId} not found`);
    return dept;
  }

  async create(dto: CreateEmployeeDto, actorId?: string) {
    await this.assertDepartmentExists(dto.department_id);

    if (dto.email) {
      const clash = await this.prisma.frontOfficeEmployee.findUnique({ where: { email: dto.email } });
      if (clash) throw new ConflictException(`An employee with email "${dto.email}" already exists`);
    }

    const employee = await this.prisma.frontOfficeEmployee.create({
      data: {
        name: dto.name,
        department_id: dto.department_id,
        designation: dto.designation,
        email: dto.email,
        phone: dto.phone,
      },
    });

    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.EMPLOYEE,
      entityId: String(employee.employee_id),
      action: 'create',
    });
    return employee;
  }

  async findAll(params: { search?: string; departmentId?: number; page?: number; limit?: number }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 25;

    const where: any = {};
    if (params.departmentId) where.department_id = params.departmentId;
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { designation: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.frontOfficeEmployee.findMany({
        where,
        include: { department: { select: { department_id: true, name: true } } },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.frontOfficeEmployee.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const employee = await this.prisma.frontOfficeEmployee.findUnique({
      where: { employee_id: id },
      include: { department: true },
    });
    if (!employee) throw new NotFoundException(`Employee #${id} not found`);
    return employee;
  }

  async update(id: number, dto: UpdateEmployeeDto, actorId?: string) {
    const existing = await this.findOne(id);

    if (dto.department_id) await this.assertDepartmentExists(dto.department_id);
    if (dto.email && dto.email !== existing.email) {
      const clash = await this.prisma.frontOfficeEmployee.findUnique({ where: { email: dto.email } });
      if (clash) throw new ConflictException(`An employee with email "${dto.email}" already exists`);
    }

    const updated = await this.prisma.frontOfficeEmployee.update({
      where: { employee_id: id },
      data: {
        name: dto.name,
        department_id: dto.department_id,
        designation: dto.designation,
        email: dto.email,
        phone: dto.phone,
        status: dto.status as any,
      },
    });

    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.EMPLOYEE,
      entityId: String(id),
      action: 'update',
      oldStatus: existing.status,
      newStatus: updated.status,
    });
    return updated;
  }

  async getAppointments(employeeId: number, params: { from?: string; to?: string; status?: string }) {
    await this.findOne(employeeId);
    const where: any = { host_employee_id: employeeId };
    if (params.status) where.status = params.status;
    if (params.from || params.to) {
      where.appointment_date = {};
      if (params.from) where.appointment_date.gte = new Date(params.from);
      if (params.to) where.appointment_date.lte = new Date(params.to);
    }
    return this.prisma.frontOfficeAppointment.findMany({
      where,
      include: {
        visitor: { select: { visitor_id: true, full_name: true, phone: true, email: true, organization: true } },
        department: { select: { name: true } },
      },
      orderBy: [{ appointment_date: 'asc' }, { start_time: 'asc' }],
    });
  }

  async getAvailability(employeeId: number, date?: string) {
    await this.findOne(employeeId);
    const where: any = { employee_id: employeeId };
    if (date) where.date = new Date(date);
    return this.prisma.frontOfficeAvailabilitySlot.findMany({ where, orderBy: [{ date: 'asc' }, { start_time: 'asc' }] });
  }

  async createAvailabilitySlot(employeeId: number, dto: CreateAvailabilitySlotDto) {
    await this.findOne(employeeId);
    if (dto.start_time >= dto.end_time) {
      throw new BadRequestException('end_time must be after start_time');
    }
    return this.prisma.frontOfficeAvailabilitySlot.create({
      data: {
        employee_id: employeeId,
        date: new Date(dto.date),
        start_time: dto.start_time,
        end_time: dto.end_time,
        is_available: dto.is_available ?? true,
      },
    });
  }

  async updateAvailabilitySlot(slotId: number, dto: Partial<CreateAvailabilitySlotDto>) {
    const slot = await this.prisma.frontOfficeAvailabilitySlot.findUnique({ where: { slot_id: slotId } });
    if (!slot) throw new NotFoundException(`Availability slot #${slotId} not found`);

    const start_time = dto.start_time ?? slot.start_time;
    const end_time = dto.end_time ?? slot.end_time;
    if (start_time >= end_time) {
      throw new BadRequestException('end_time must be after start_time');
    }

    return this.prisma.frontOfficeAvailabilitySlot.update({
      where: { slot_id: slotId },
      data: {
        date: dto.date ? new Date(dto.date) : undefined,
        start_time: dto.start_time,
        end_time: dto.end_time,
        is_available: dto.is_available,
      },
    });
  }

  async deleteAvailabilitySlot(slotId: number) {
    const slot = await this.prisma.frontOfficeAvailabilitySlot.findUnique({ where: { slot_id: slotId } });
    if (!slot) throw new NotFoundException(`Availability slot #${slotId} not found`);
    await this.prisma.frontOfficeAvailabilitySlot.delete({ where: { slot_id: slotId } });
    return { deleted: true };
  }

  /**
   * Employees free for a given date/time window: has an is_available slot
   * covering the window (if any slots are configured for that employee/date
   * — employees with no configured slots for the day are treated as
   * unconstrained/available, since availability configuration is optional
   * per section 16) AND no conflicting non-cancelled appointment.
   */
  async findAvailableEmployees(params: { date: string; start_time: string; end_time: string; department_id?: number }) {
    if (params.start_time >= params.end_time) {
      throw new BadRequestException('end_time must be after start_time');
    }
    const windowStart = combineDateAndTime(params.date, params.start_time);
    const windowEnd = combineDateAndTime(params.date, params.end_time);
    const dateOnly = new Date(params.date);

    const employees = await this.prisma.frontOfficeEmployee.findMany({
      where: { status: 'ACTIVE', department_id: params.department_id },
      include: {
        availability_slots: { where: { date: dateOnly } },
        hosted_appointments: {
          where: {
            appointment_date: dateOnly,
            status: { notIn: ['cancelled', 'no_show'] },
          },
        },
      },
    });

    return employees
      .filter((emp) => {
        if (emp.availability_slots.length > 0) {
          const covered = emp.availability_slots.some(
            (slot) => slot.is_available && slot.start_time <= params.start_time && slot.end_time >= params.end_time,
          );
          if (!covered) return false;
        }
        const hasConflict = emp.hosted_appointments.some(
          (appt) => appt.start_time < windowEnd && appt.end_time > windowStart,
        );
        return !hasConflict;
      })
      .map(({ availability_slots, hosted_appointments, ...emp }) => emp);
  }
}
