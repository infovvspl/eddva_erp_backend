import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FrontOfficeAuditService } from '../common/front-office-audit.service';
import { FrontOfficeNotificationService } from '../notifications/front-office-notification.service';
import { FO_ENTITY } from '../common/front-office-entities';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';
import { UpdateEnquiryDto } from './dto/update-enquiry.dto';
import { AssignEnquiryDto } from './dto/assign-enquiry.dto';
import { ChangeEnquiryStatusDto } from './dto/change-enquiry-status.dto';
import { CreateFollowupDto } from './dto/create-followup.dto';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  open: ['in_progress', 'closed'],
  in_progress: ['closed'],
  closed: [],
};

@Injectable()
export class EnquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FrontOfficeAuditService,
    private readonly notifications: FrontOfficeNotificationService,
  ) {}

  private async assertEmployeeExists(employeeId: number) {
    const employee = await this.prisma.frontOfficeEmployee.findUnique({ where: { employee_id: employeeId } });
    if (!employee) throw new NotFoundException(`Employee #${employeeId} not found`);
    return employee;
  }

  async create(dto: CreateEnquiryDto, actorId?: string) {
    if (dto.assigned_to) await this.assertEmployeeExists(dto.assigned_to);

    const enquiry = await this.prisma.frontOfficeEnquiry.create({
      data: {
        enquirer_name: dto.enquirer_name,
        phone: dto.phone,
        email: dto.email,
        source: dto.source as any,
        category: dto.category,
        description: dto.description,
        assigned_to: dto.assigned_to,
        created_by: actorId,
      },
    });

    await this.audit.log({ userId: actorId, entityType: FO_ENTITY.ENQUIRY, entityId: String(enquiry.enquiry_id), action: 'create' });

    if (dto.assigned_to) {
      await this.notifications.send({
        entityType: 'enquiry',
        entityId: enquiry.enquiry_id,
        eventType: 'enquiry_assigned',
        recipientEmployeeId: dto.assigned_to,
        message: `New enquiry from ${dto.enquirer_name} assigned to you.`,
      });
    }

    return enquiry;
  }

  async findAll(
    params: {
      source?: string;
      category?: string;
      status?: string;
      assigned_to?: number;
      search?: string;
      created_from?: string;
      created_to?: string;
      page?: number;
      limit?: number;
      sort?: string;
    },
    scopeWhere: Record<string, any> = {},
  ) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 25;

    const filters: any = {};
    if (params.source) filters.source = params.source;
    if (params.category) filters.category = params.category;
    if (params.status) filters.status = params.status;
    if (params.assigned_to) filters.assigned_to = params.assigned_to;
    if (params.created_from || params.created_to) {
      filters.created_at = {};
      if (params.created_from) filters.created_at.gte = new Date(params.created_from);
      if (params.created_to) filters.created_at.lte = new Date(params.created_to);
    }
    if (params.search) {
      filters.OR = [
        { enquirer_name: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const where = Object.keys(scopeWhere).length > 0 ? { AND: [filters, scopeWhere] } : filters;

    const [sortField, sortDir] = (params.sort || 'created_at:desc').split(':');

    const [data, total] = await this.prisma.$transaction([
      this.prisma.frontOfficeEnquiry.findMany({
        where,
        include: { assignee: { select: { employee_id: true, name: true, department_id: true } } },
        orderBy: { [sortField]: sortDir === 'asc' ? 'asc' : 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.frontOfficeEnquiry.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const enquiry = await this.prisma.frontOfficeEnquiry.findUnique({
      where: { enquiry_id: id },
      include: { assignee: true, followups: { orderBy: { followup_date: 'desc' } } },
    });
    if (!enquiry) throw new NotFoundException(`Enquiry #${id} not found`);
    return enquiry;
  }

  private async assertExists(id: number) {
    const enquiry = await this.prisma.frontOfficeEnquiry.findUnique({ where: { enquiry_id: id } });
    if (!enquiry) throw new NotFoundException(`Enquiry #${id} not found`);
    return enquiry;
  }

  async update(id: number, dto: UpdateEnquiryDto, actorId?: string) {
    await this.assertExists(id);
    const updated = await this.prisma.frontOfficeEnquiry.update({
      where: { enquiry_id: id },
      data: {
        enquirer_name: dto.enquirer_name,
        phone: dto.phone,
        email: dto.email,
        source: dto.source as any,
        category: dto.category,
        description: dto.description,
      },
    });
    await this.audit.log({ userId: actorId, entityType: FO_ENTITY.ENQUIRY, entityId: String(id), action: 'update' });
    return updated;
  }

  async assign(id: number, dto: AssignEnquiryDto, actorId?: string) {
    const existing = await this.assertExists(id);
    await this.assertEmployeeExists(dto.assigned_to);

    const updated = await this.prisma.frontOfficeEnquiry.update({
      where: { enquiry_id: id },
      data: { assigned_to: dto.assigned_to },
    });

    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.ENQUIRY,
      entityId: String(id),
      action: existing.assigned_to ? 'reassign' : 'assign',
      reason: dto.reason,
      oldStatus: existing.assigned_to ? String(existing.assigned_to) : undefined,
      newStatus: String(dto.assigned_to),
    });

    await this.notifications.send({
      entityType: 'enquiry',
      entityId: id,
      eventType: existing.assigned_to ? 'enquiry_reassigned' : 'enquiry_assigned',
      recipientEmployeeId: dto.assigned_to,
      message: `Enquiry #${id} from ${existing.enquirer_name} assigned to you.`,
    });

    return updated;
  }

  async changeStatus(id: number, dto: ChangeEnquiryStatusDto, actorId?: string) {
    const existing = await this.assertExists(id);
    const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(`Cannot transition enquiry from "${existing.status}" to "${dto.status}"`);
    }

    const updated = await this.prisma.frontOfficeEnquiry.update({
      where: { enquiry_id: id },
      data: { status: dto.status as any },
    });

    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.ENQUIRY,
      entityId: String(id),
      action: 'status_change',
      oldStatus: existing.status,
      newStatus: dto.status,
      reason: dto.reason,
    });

    if (dto.status === 'closed' && existing.assigned_to) {
      await this.notifications.send({
        entityType: 'enquiry',
        entityId: id,
        eventType: 'enquiry_closed',
        recipientEmployeeId: existing.assigned_to,
        message: `Enquiry #${id} has been closed.`,
      });
    }

    return updated;
  }

  async createFollowup(enquiryId: number, dto: CreateFollowupDto, actorId?: string) {
    const enquiry = await this.assertExists(enquiryId);
    if (enquiry.status === 'closed') {
      throw new ConflictException('Cannot add a follow-up to a closed enquiry — reopen it via a status change first');
    }
    if (dto.next_followup_date && dto.followup_date && dto.next_followup_date < dto.followup_date) {
      throw new BadRequestException('next_followup_date cannot be before followup_date');
    }

    const followup = await this.prisma.frontOfficeEnquiryFollowup.create({
      data: {
        enquiry_id: enquiryId,
        notes: dto.notes,
        followup_date: dto.followup_date ? new Date(dto.followup_date) : new Date(),
        next_followup_date: dto.next_followup_date ? new Date(dto.next_followup_date) : null,
        updated_by: actorId,
      },
    });

    if (enquiry.status === 'open') {
      await this.prisma.frontOfficeEnquiry.update({ where: { enquiry_id: enquiryId }, data: { status: 'in_progress' } });
    }

    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.ENQUIRY_FOLLOWUP,
      entityId: String(followup.followup_id),
      action: 'create',
      metadata: { enquiry_id: enquiryId },
    });

    return followup;
  }

  async listFollowups(enquiryId: number) {
    await this.assertExists(enquiryId);
    return this.prisma.frontOfficeEnquiryFollowup.findMany({ where: { enquiry_id: enquiryId }, orderBy: { followup_date: 'desc' } });
  }

  async upcomingFollowups(withinDays = 7) {
    const now = new Date();
    const until = new Date(now);
    until.setDate(until.getDate() + withinDays);
    return this.prisma.frontOfficeEnquiryFollowup.findMany({
      where: { next_followup_date: { gte: now, lte: until } },
      include: { enquiry: { select: { enquiry_id: true, enquirer_name: true, status: true, assigned_to: true } } },
      orderBy: { next_followup_date: 'asc' },
    });
  }

  async overdueFollowups() {
    const now = new Date();
    return this.prisma.frontOfficeEnquiryFollowup.findMany({
      where: { next_followup_date: { lt: now }, enquiry: { status: { not: 'closed' } } },
      include: { enquiry: { select: { enquiry_id: true, enquirer_name: true, status: true, assigned_to: true } } },
      orderBy: { next_followup_date: 'asc' },
    });
  }

  async history(id: number) {
    await this.assertExists(id);
    return this.audit.getLogsForEntity(FO_ENTITY.ENQUIRY, String(id));
  }
}
