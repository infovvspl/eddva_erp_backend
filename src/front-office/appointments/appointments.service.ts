import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FrontOfficeAuditService } from '../common/front-office-audit.service';
import { FrontOfficeNotificationService } from '../notifications/front-office-notification.service';
import { FO_ENTITY } from '../common/front-office-entities';
import { combineDateAndTime, dateToLockKey, toHHmm } from '../common/time.util';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { CancelAppointmentDto, CompleteAppointmentDto } from './dto/cancel-appointment.dto';

const NON_BLOCKING_STATUSES = ['cancelled', 'no_show'];

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['completed', 'cancelled', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
};

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FrontOfficeAuditService,
    private readonly notifications: FrontOfficeNotificationService,
  ) {}

  /**
   * Runs `fn` under a Postgres transaction-scoped advisory lock keyed on
   * (host_employee_id, date-as-YYYYMMDD-int). Any two requests trying to
   * book/reschedule the same employee's day serialize through this lock, so
   * the overlap check + insert/update inside `fn` cannot race — this is the
   * concurrency-safety mechanism required by section 15/35. No Redis exists
   * in this project (see feedback from the sports/library JWT fix session);
   * pg_advisory_xact_lock is the equivalent "existing database capability".
   */
  private async withSlotLock<T>(hostEmployeeId: number, dateStr: string, fn: (tx: PrismaService) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await (tx as any).$executeRawUnsafe('SELECT pg_advisory_xact_lock($1::int, $2::int)', hostEmployeeId, dateToLockKey(dateStr));
      return fn(tx as any);
    });
  }

  private async findOverlap(tx: PrismaService, hostEmployeeId: number, start: Date, end: Date, excludeAppointmentId?: number) {
    return tx.frontOfficeAppointment.findFirst({
      where: {
        host_employee_id: hostEmployeeId,
        status: { notIn: NON_BLOCKING_STATUSES as any },
        start_time: { lt: end },
        end_time: { gt: start },
        appointment_id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
      },
    });
  }

  async create(dto: CreateAppointmentDto, actorId?: string) {
    if (dto.start_time >= dto.end_time) throw new BadRequestException('end_time must be after start_time');

    const department = await this.prisma.frontOfficeDepartment.findUnique({ where: { department_id: dto.department_id } });
    if (!department) throw new NotFoundException(`Department #${dto.department_id} not found`);

    const host = await this.prisma.frontOfficeEmployee.findUnique({ where: { employee_id: dto.host_employee_id } });
    if (!host) throw new NotFoundException(`Employee #${dto.host_employee_id} not found`);

    if (dto.visitor_id) {
      const visitor = await this.prisma.frontOfficeVisitor.findUnique({ where: { visitor_id: dto.visitor_id } });
      if (!visitor) throw new NotFoundException(`Visitor #${dto.visitor_id} not found`);
    }

    const start = combineDateAndTime(dto.appointment_date, dto.start_time);
    const end = combineDateAndTime(dto.appointment_date, dto.end_time);

    const appointment = await this.withSlotLock(dto.host_employee_id, dto.appointment_date, async (tx) => {
      const overlap = await this.findOverlap(tx, dto.host_employee_id, start, end);
      if (overlap) {
        throw new ConflictException(
          `${host.name} already has an appointment from ${overlap.start_time.toISOString().slice(11, 16)} to ${overlap.end_time.toISOString().slice(11, 16)} on this date`,
        );
      }
      return tx.frontOfficeAppointment.create({
        data: {
          visitor_id: dto.visitor_id,
          visitor_name: dto.visitor_name,
          phone: dto.phone,
          host_employee_id: dto.host_employee_id,
          department_id: dto.department_id,
          appointment_date: new Date(dto.appointment_date),
          start_time: start,
          end_time: end,
          purpose: dto.purpose,
          created_by: actorId,
        },
      });
    });

    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.APPOINTMENT,
      entityId: String(appointment.appointment_id),
      action: 'create',
      newStatus: appointment.status,
    });

    await this.notifications.send({
      entityType: 'appointment',
      entityId: appointment.appointment_id,
      eventType: 'appointment_created',
      recipientEmployeeId: dto.host_employee_id,
      message: `New appointment with ${dto.visitor_name} on ${dto.appointment_date} ${dto.start_time}.`,
    });

    return appointment;
  }

  async findAll(
    params: {
      date_from?: string;
      date_to?: string;
      host_employee_id?: number;
      department_id?: number;
      status?: string;
      visitor_id?: number;
      phone?: string;
      page?: number;
      limit?: number;
    },
    scopeWhere: Record<string, any> = {},
  ) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 25;

    const filters: any = {};
    if (params.host_employee_id) filters.host_employee_id = params.host_employee_id;
    if (params.department_id) filters.department_id = params.department_id;
    if (params.status) filters.status = params.status;
    if (params.visitor_id) filters.visitor_id = params.visitor_id;
    if (params.phone) filters.phone = { contains: params.phone };
    if (params.date_from || params.date_to) {
      filters.appointment_date = {};
      if (params.date_from) filters.appointment_date.gte = new Date(params.date_from);
      if (params.date_to) filters.appointment_date.lte = new Date(params.date_to);
    }

    const where = Object.keys(scopeWhere).length > 0 ? { AND: [filters, scopeWhere] } : filters;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.frontOfficeAppointment.findMany({
        where,
        include: {
          visitor: { select: { visitor_id: true, full_name: true } },
          host_employee: { select: { employee_id: true, name: true } },
          department: { select: { department_id: true, name: true } },
        },
        orderBy: [{ appointment_date: 'asc' }, { start_time: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.frontOfficeAppointment.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const appointment = await this.prisma.frontOfficeAppointment.findUnique({
      where: { appointment_id: id },
      include: {
        visitor: { select: { visitor_id: true, full_name: true, phone: true, email: true, organization: true } },
        host_employee: true,
        department: true,
        visitor_log: true,
      },
    });
    if (!appointment) throw new NotFoundException(`Appointment #${id} not found`);
    return appointment;
  }

  private async assertExists(id: number) {
    const appointment = await this.prisma.frontOfficeAppointment.findUnique({ where: { appointment_id: id } });
    if (!appointment) throw new NotFoundException(`Appointment #${id} not found`);
    return appointment;
  }

  async update(id: number, dto: UpdateAppointmentDto, actorId?: string) {
    await this.assertExists(id);
    if (dto.visitor_id) {
      const visitor = await this.prisma.frontOfficeVisitor.findUnique({ where: { visitor_id: dto.visitor_id } });
      if (!visitor) throw new NotFoundException(`Visitor #${dto.visitor_id} not found`);
    }
    const updated = await this.prisma.frontOfficeAppointment.update({
      where: { appointment_id: id },
      data: { visitor_id: dto.visitor_id, visitor_name: dto.visitor_name, phone: dto.phone, purpose: dto.purpose },
    });
    await this.audit.log({ userId: actorId, entityType: FO_ENTITY.APPOINTMENT, entityId: String(id), action: 'update' });
    return updated;
  }

  private async transition(id: number, targetStatus: string, actorId: string | undefined, action: string, reason?: string, extra?: Record<string, any>) {
    const existing = await this.assertExists(id);
    const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(targetStatus)) {
      throw new ConflictException(`Cannot transition appointment from "${existing.status}" to "${targetStatus}"`);
    }

    const updated = await this.prisma.frontOfficeAppointment.update({
      where: { appointment_id: id },
      data: { status: targetStatus as any, ...extra },
    });

    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.APPOINTMENT,
      entityId: String(id),
      action,
      oldStatus: existing.status,
      newStatus: targetStatus,
      reason,
    });

    await this.notifications.send({
      entityType: 'appointment',
      entityId: id,
      eventType: `appointment_${targetStatus}`,
      recipientEmployeeId: existing.host_employee_id,
      message: `Appointment #${id} is now ${targetStatus}.`,
    });

    return updated;
  }

  confirm(id: number, actorId?: string) {
    return this.transition(id, 'confirmed', actorId, 'confirm');
  }

  cancel(id: number, dto: CancelAppointmentDto, actorId?: string) {
    return this.transition(id, 'cancelled', actorId, 'cancel', dto.reason);
  }

  complete(id: number, dto: CompleteAppointmentDto, actorId?: string) {
    return this.transition(id, 'completed', actorId, 'complete', dto.notes);
  }

  noShow(id: number, actorId?: string) {
    return this.transition(id, 'no_show', actorId, 'no_show');
  }

  async reschedule(id: number, dto: RescheduleAppointmentDto, actorId?: string) {
    const existing = await this.assertExists(id);
    if (!['scheduled', 'confirmed'].includes(existing.status)) {
      throw new ConflictException(`Cannot reschedule an appointment that is already "${existing.status}"`);
    }
    if (dto.start_time >= dto.end_time) throw new BadRequestException('end_time must be after start_time');

    const hostEmployeeId = dto.host_employee_id ?? existing.host_employee_id;
    if (dto.host_employee_id) {
      const host = await this.prisma.frontOfficeEmployee.findUnique({ where: { employee_id: dto.host_employee_id } });
      if (!host) throw new NotFoundException(`Employee #${dto.host_employee_id} not found`);
    }

    const start = combineDateAndTime(dto.appointment_date, dto.start_time);
    const end = combineDateAndTime(dto.appointment_date, dto.end_time);

    const updated = await this.withSlotLock(hostEmployeeId, dto.appointment_date, async (tx) => {
      const overlap = await this.findOverlap(tx, hostEmployeeId, start, end, id);
      if (overlap) {
        throw new ConflictException('The requested time slot conflicts with another active appointment for this host');
      }
      return tx.frontOfficeAppointment.update({
        where: { appointment_id: id },
        data: {
          appointment_date: new Date(dto.appointment_date),
          start_time: start,
          end_time: end,
          host_employee_id: hostEmployeeId,
          status: 'scheduled',
        },
      });
    });

    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.APPOINTMENT,
      entityId: String(id),
      action: 'reschedule',
      oldStatus: existing.status,
      newStatus: 'scheduled',
      metadata: { from: { date: existing.appointment_date, start: existing.start_time, end: existing.end_time }, to: { date: dto.appointment_date, start: dto.start_time, end: dto.end_time } },
    });

    await this.notifications.send({
      entityType: 'appointment',
      entityId: id,
      eventType: 'appointment_rescheduled',
      recipientEmployeeId: hostEmployeeId,
      message: `Appointment #${id} rescheduled to ${dto.appointment_date} ${dto.start_time}.`,
    });

    return updated;
  }

  async checkConflicts(params: { host_employee_id: number; date: string; start_time: string; end_time: string; exclude_appointment_id?: number }) {
    const start = combineDateAndTime(params.date, params.start_time);
    const end = combineDateAndTime(params.date, params.end_time);
    const conflicts = await this.prisma.frontOfficeAppointment.findMany({
      where: {
        host_employee_id: params.host_employee_id,
        status: { notIn: NON_BLOCKING_STATUSES as any },
        start_time: { lt: end },
        end_time: { gt: start },
        appointment_id: params.exclude_appointment_id ? { not: params.exclude_appointment_id } : undefined,
      },
    });
    return { has_conflict: conflicts.length > 0, conflicts };
  }

  async today(scopeWhere: Record<string, any> = {}) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const filters = { appointment_date: today };
    const where = Object.keys(scopeWhere).length > 0 ? { AND: [filters, scopeWhere] } : filters;
    return this.prisma.frontOfficeAppointment.findMany({
      where,
      include: { visitor: { select: { full_name: true } }, host_employee: { select: { name: true } } },
      orderBy: { start_time: 'asc' },
    });
  }

  /** Open time windows for a host on a given date, after subtracting booked (non-cancelled/no_show) appointments from their configured availability slots. */
  async getAvailableSlots(hostEmployeeId: number, date: string) {
    const employee = await this.prisma.frontOfficeEmployee.findUnique({ where: { employee_id: hostEmployeeId } });
    if (!employee) throw new NotFoundException(`Employee #${hostEmployeeId} not found`);

    const dateOnly = new Date(date);
    const slots = await this.prisma.frontOfficeAvailabilitySlot.findMany({
      where: { employee_id: hostEmployeeId, date: dateOnly, is_available: true },
      orderBy: { start_time: 'asc' },
    });
    const appointments = await this.prisma.frontOfficeAppointment.findMany({
      where: { host_employee_id: hostEmployeeId, appointment_date: dateOnly, status: { notIn: NON_BLOCKING_STATUSES as any } },
      orderBy: { start_time: 'asc' },
    });
    const booked = appointments.map((a) => ({ start_time: toHHmm(a.start_time), end_time: toHHmm(a.end_time) }));

    if (slots.length === 0) {
      // No availability configured for this employee/date — treated as unconstrained (section 16); only booked ranges are known blockers.
      return { employee_id: hostEmployeeId, date, configured: false, booked, free_slots: [] };
    }

    const freeSlots: Array<{ start_time: string; end_time: string }> = [];
    for (const slot of slots) {
      let cursor = slot.start_time;
      const bookedInSlot = booked.filter((b) => b.start_time < slot.end_time && b.end_time > slot.start_time);
      for (const b of bookedInSlot) {
        if (b.start_time > cursor) freeSlots.push({ start_time: cursor, end_time: b.start_time });
        if (b.end_time > cursor) cursor = b.end_time;
      }
      if (cursor < slot.end_time) freeSlots.push({ start_time: cursor, end_time: slot.end_time });
    }

    return { employee_id: hostEmployeeId, date, configured: true, booked, free_slots: freeSlots };
  }

  async upcoming(days = 7, scopeWhere: Record<string, any> = {}) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const until = new Date(today);
    until.setDate(until.getDate() + days);
    const filters = { appointment_date: { gte: today, lte: until }, status: { notIn: NON_BLOCKING_STATUSES as any } };
    const where = Object.keys(scopeWhere).length > 0 ? { AND: [filters, scopeWhere] } : filters;
    return this.prisma.frontOfficeAppointment.findMany({
      where,
      include: { visitor: { select: { full_name: true } }, host_employee: { select: { name: true } } },
      orderBy: [{ appointment_date: 'asc' }, { start_time: 'asc' }],
    });
  }
}
