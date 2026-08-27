import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FrontOfficeAuditService } from '../common/front-office-audit.service';
import { NumberingService } from '../../numbering/numbering.service';
import { FrontOfficeNotificationService } from '../notifications/front-office-notification.service';
import { FO_ENTITY } from '../common/front-office-entities';
import { VisitorsService } from './visitors.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';

const TERMINAL_APPOINTMENT_STATUSES = ['cancelled', 'completed', 'no_show'];

@Injectable()
export class VisitorLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FrontOfficeAuditService,
    private readonly numbering: NumberingService,
    private readonly notifications: FrontOfficeNotificationService,
    private readonly visitorsService: VisitorsService,
  ) {}

  /**
   * Check a visitor in — also serves as the "appointment → visitor
   * conversion" flow from section 17 when appointment_id is supplied: host
   * and visitor details are cross-populated from the appointment rather than
   * trusted blindly from the request body.
   */
  async checkIn(dto: CheckInDto, actorId?: string) {
    let appointment: any = null;
    if (dto.appointment_id) {
      appointment = await this.prisma.frontOfficeAppointment.findUnique({
        where: { appointment_id: dto.appointment_id },
        include: { host_employee: true, visitor: true },
      });
      if (!appointment) throw new NotFoundException(`Appointment #${dto.appointment_id} not found`);
      if (TERMINAL_APPOINTMENT_STATUSES.includes(appointment.status)) {
        throw new ConflictException(`Cannot check in against a ${appointment.status} appointment`);
      }
      if (dto.visitor_id && appointment.visitor_id && appointment.visitor_id !== dto.visitor_id) {
        throw new BadRequestException('The supplied visitor_id does not match the visitor linked to this appointment');
      }
    }

    // 1. Identify or create the visitor master record.
    let visitor;
    if (dto.visitor_id) {
      visitor = await this.prisma.frontOfficeVisitor.findUnique({ where: { visitor_id: dto.visitor_id } });
      if (!visitor) throw new NotFoundException(`Visitor #${dto.visitor_id} not found`);
    } else if (appointment?.visitor) {
      visitor = appointment.visitor;
    } else {
      const resolvedFullName = dto.full_name ?? appointment?.visitor_name;
      if (!resolvedFullName) throw new BadRequestException('full_name is required when neither visitor_id nor an appointment with a visitor_name is supplied');
      visitor = await this.visitorsService.findOrCreate(
        {
          full_name: resolvedFullName,
          phone: dto.phone ?? appointment?.phone ?? undefined,
          email: dto.email,
          id_proof_type: dto.id_proof_type,
          id_proof_number: dto.id_proof_number,
          photo_url: dto.photo_url,
          organization: dto.organization,
        },
        actorId,
      );
    }

    // Link a pre-booked appointment to the now-identified visitor master record.
    if (appointment && !appointment.visitor_id) {
      await this.prisma.frontOfficeAppointment.update({
        where: { appointment_id: appointment.appointment_id },
        data: { visitor_id: visitor.visitor_id },
      });
    }

    const hostEmployeeId = appointment ? appointment.host_employee_id : dto.host_employee_id;
    if (!hostEmployeeId) throw new BadRequestException('host_employee_id is required when not checking in against an appointment');

    const host = await this.prisma.frontOfficeEmployee.findUnique({ where: { employee_id: hostEmployeeId } });
    if (!host) throw new NotFoundException(`Employee #${hostEmployeeId} not found`);

    // Pre-checks for a friendly error; the partial unique indexes on
    // (badge_number) and (visitor_id) WHERE status='checked_in' are the
    // real concurrency-safe guarantee against a race between two
    // simultaneous check-in requests (see migration front_office_module).
    const activeVisit = await this.prisma.frontOfficeVisitorLog.findFirst({
      where: { visitor_id: visitor.visitor_id, status: 'checked_in' },
    });
    if (activeVisit) {
      throw new ConflictException(`Visitor #${visitor.visitor_id} already has an active visit (log #${activeVisit.log_id})`);
    }

    const badgeNumber = dto.badge_number || (await this.numbering.generateNextNumber(DocumentType.VISITOR_BADGE));
    const badgeInUse = await this.prisma.frontOfficeVisitorLog.findFirst({
      where: { badge_number: badgeNumber, status: 'checked_in' },
    });
    if (badgeInUse) {
      throw new ConflictException(`Badge "${badgeNumber}" is already assigned to an active visit`);
    }

    let log;
    try {
      log = await this.prisma.frontOfficeVisitorLog.create({
        data: {
          visitor_id: visitor.visitor_id,
          host_employee_id: hostEmployeeId,
          appointment_id: appointment?.appointment_id,
          purpose: dto.purpose ?? appointment?.purpose,
          badge_number: badgeNumber,
          status: 'checked_in',
          created_by: actorId,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('This visitor already has an active visit, or the badge is already in use by another checked-in visitor.');
      }
      throw err;
    }

    if (appointment && appointment.status === 'scheduled') {
      await this.prisma.frontOfficeAppointment.update({
        where: { appointment_id: appointment.appointment_id },
        data: { status: 'confirmed' },
      });
    }

    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.VISITOR_LOG,
      entityId: String(log.log_id),
      action: 'check_in',
      newStatus: 'checked_in',
      metadata: { visitor_id: visitor.visitor_id, host_employee_id: hostEmployeeId, appointment_id: appointment?.appointment_id },
    });

    await this.notifications.send({
      entityType: 'visitor',
      entityId: log.log_id,
      eventType: 'visitor_checked_in',
      recipientEmployeeId: hostEmployeeId,
      message: `${visitor.full_name} has checked in to see you (badge ${badgeNumber}).`,
    });

    return this.findOne(log.log_id);
  }

  async checkOut(logId: number, dto: CheckOutDto, actorId?: string) {
    const log = await this.prisma.frontOfficeVisitorLog.findUnique({ where: { log_id: logId } });
    if (!log) throw new NotFoundException(`Visitor log #${logId} not found`);
    if (log.status !== 'checked_in') {
      throw new ConflictException(`Visitor log #${logId} is already ${log.status}`);
    }

    const updated = await this.prisma.frontOfficeVisitorLog.update({
      where: { log_id: logId },
      data: { status: 'checked_out', check_out_time: new Date() },
    });

    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.VISITOR_LOG,
      entityId: String(logId),
      action: 'check_out',
      oldStatus: 'checked_in',
      newStatus: 'checked_out',
      reason: dto.remarks,
    });

    await this.notifications.send({
      entityType: 'visitor',
      entityId: logId,
      eventType: 'visitor_checked_out',
      recipientEmployeeId: log.host_employee_id,
      message: `Visitor (log #${logId}) has checked out.`,
    });

    return updated;
  }

  async findAll(
    params: { date?: string; host_employee_id?: number; status?: string; appointment_id?: number; visitor_id?: number; page?: number; limit?: number },
    scopeWhere: Record<string, any> = {},
  ) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 25;

    const filters: any = {};
    if (params.host_employee_id) filters.host_employee_id = params.host_employee_id;
    if (params.status) filters.status = params.status;
    if (params.appointment_id) filters.appointment_id = params.appointment_id;
    if (params.visitor_id) filters.visitor_id = params.visitor_id;
    if (params.date) {
      const start = new Date(params.date);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      filters.check_in_time = { gte: start, lt: end };
    }

    const where = Object.keys(scopeWhere).length > 0 ? { AND: [filters, scopeWhere] } : filters;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.frontOfficeVisitorLog.findMany({
        where,
        include: {
          visitor: { select: { visitor_id: true, full_name: true, phone: true, organization: true } },
          host_employee: { select: { employee_id: true, name: true, department_id: true } },
        },
        orderBy: { check_in_time: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.frontOfficeVisitorLog.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findActive() {
    return this.prisma.frontOfficeVisitorLog.findMany({
      where: { status: 'checked_in' },
      include: {
        visitor: { select: { visitor_id: true, full_name: true, phone: true, organization: true } },
        host_employee: { select: { employee_id: true, name: true, department_id: true } },
      },
      orderBy: { check_in_time: 'asc' },
    });
  }

  async findOne(id: number) {
    const log = await this.prisma.frontOfficeVisitorLog.findUnique({
      where: { log_id: id },
      include: {
        // id_proof_number is deliberately excluded here — visitor logs never expose it,
        // even encrypted; the dedicated /visitors/:id endpoint is the only sensitive-view path.
        visitor: { select: { visitor_id: true, full_name: true, phone: true, email: true, organization: true, photo_url: true } },
        host_employee: { select: { employee_id: true, name: true, department_id: true } },
        appointment: true,
      },
    });
    if (!log) throw new NotFoundException(`Visitor log #${id} not found`);
    return log;
  }
}
