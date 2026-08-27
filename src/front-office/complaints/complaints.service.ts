import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FrontOfficeAuditService } from '../common/front-office-audit.service';
import { FrontOfficeNotificationService } from '../notifications/front-office-notification.service';
import { FO_ENTITY } from '../common/front-office-entities';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { AssignComplaintDto } from './dto/assign-complaint.dto';
import { ChangeComplaintPriorityDto } from './dto/change-priority.dto';
import { ChangeComplaintStatusDto } from './dto/change-complaint-status.dto';
import { CreateComplaintUpdateDto } from './dto/create-complaint-update.dto';
import { EscalateComplaintDto } from './dto/escalate-complaint.dto';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  open: ['in_progress', 'resolved', 'closed'],
  in_progress: ['resolved', 'closed', 'open'],
  resolved: ['closed', 'open'],
  closed: ['open'],
};

const PRIORITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

@Injectable()
export class ComplaintsService {
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

  private async assertExists(id: number) {
    const complaint = await this.prisma.frontOfficeComplaint.findUnique({ where: { complaint_id: id } });
    if (!complaint) throw new NotFoundException(`Complaint #${id} not found`);
    return complaint;
  }

  private async addTimelineEntry(complaintId: number, notes: string, statusChange: string | undefined, actorId?: string) {
    return this.prisma.frontOfficeComplaintUpdate.create({
      data: { complaint_id: complaintId, notes, status_change: statusChange, updated_by: actorId },
    });
  }

  async create(dto: CreateComplaintDto, actorId?: string) {
    if (dto.assigned_to) await this.assertEmployeeExists(dto.assigned_to);

    const complaint = await this.prisma.frontOfficeComplaint.create({
      data: {
        complainant_name: dto.complainant_name,
        phone: dto.phone,
        email: dto.email,
        category: dto.category,
        description: dto.description,
        priority: (dto.priority as any) ?? 'medium',
        assigned_to: dto.assigned_to,
        created_by: actorId,
      },
    });

    await this.addTimelineEntry(complaint.complaint_id, 'Complaint registered', undefined, actorId);
    await this.audit.log({ userId: actorId, entityType: FO_ENTITY.COMPLAINT, entityId: String(complaint.complaint_id), action: 'create' });

    if (dto.assigned_to) {
      await this.notifications.send({
        entityType: 'complaint',
        entityId: complaint.complaint_id,
        eventType: 'complaint_assigned',
        recipientEmployeeId: dto.assigned_to,
        message: `New ${complaint.priority} priority complaint from ${dto.complainant_name} assigned to you.`,
      });
    }

    return complaint;
  }

  async findAll(
    params: {
      category?: string;
      priority?: string;
      status?: string;
      assigned_to?: number;
      date_from?: string;
      date_to?: string;
      phone?: string;
      email?: string;
      page?: number;
      limit?: number;
    },
    scopeWhere: Record<string, any> = {},
  ) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 25;

    const filters: any = {};
    if (params.category) filters.category = params.category;
    if (params.priority) filters.priority = params.priority;
    if (params.status) filters.status = params.status;
    if (params.assigned_to) filters.assigned_to = params.assigned_to;
    if (params.phone) filters.phone = { contains: params.phone };
    if (params.email) filters.email = { contains: params.email, mode: 'insensitive' };
    if (params.date_from || params.date_to) {
      filters.created_at = {};
      if (params.date_from) filters.created_at.gte = new Date(params.date_from);
      if (params.date_to) filters.created_at.lte = new Date(params.date_to);
    }

    const where = Object.keys(scopeWhere).length > 0 ? { AND: [filters, scopeWhere] } : filters;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.frontOfficeComplaint.findMany({
        where,
        include: { assignee: { select: { employee_id: true, name: true, department_id: true } } },
        orderBy: [{ priority: 'desc' }, { created_at: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.frontOfficeComplaint.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const complaint = await this.prisma.frontOfficeComplaint.findUnique({
      where: { complaint_id: id },
      include: { assignee: true, updates: { orderBy: { updated_at: 'desc' } } },
    });
    if (!complaint) throw new NotFoundException(`Complaint #${id} not found`);
    return complaint;
  }

  async update(id: number, dto: UpdateComplaintDto, actorId?: string) {
    await this.assertExists(id);
    const updated = await this.prisma.frontOfficeComplaint.update({
      where: { complaint_id: id },
      data: { complainant_name: dto.complainant_name, phone: dto.phone, email: dto.email, category: dto.category, description: dto.description },
    });
    await this.audit.log({ userId: actorId, entityType: FO_ENTITY.COMPLAINT, entityId: String(id), action: 'update' });
    return updated;
  }

  async assign(id: number, dto: AssignComplaintDto, actorId?: string) {
    const existing = await this.assertExists(id);
    await this.assertEmployeeExists(dto.assigned_to);

    const updated = await this.prisma.frontOfficeComplaint.update({ where: { complaint_id: id }, data: { assigned_to: dto.assigned_to } });
    const action = existing.assigned_to ? 'reassign' : 'assign';

    await this.addTimelineEntry(id, dto.reason || `Complaint ${action}ed to employee #${dto.assigned_to}`, action, actorId);
    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.COMPLAINT,
      entityId: String(id),
      action,
      reason: dto.reason,
      oldStatus: existing.assigned_to ? String(existing.assigned_to) : undefined,
      newStatus: String(dto.assigned_to),
    });
    await this.notifications.send({
      entityType: 'complaint',
      entityId: id,
      eventType: existing.assigned_to ? 'complaint_reassigned' : 'complaint_assigned',
      recipientEmployeeId: dto.assigned_to,
      message: `Complaint #${id} assigned to you.`,
    });

    return updated;
  }

  async changePriority(id: number, dto: ChangeComplaintPriorityDto, actorId?: string) {
    const existing = await this.assertExists(id);
    const updated = await this.prisma.frontOfficeComplaint.update({ where: { complaint_id: id }, data: { priority: dto.priority as any } });

    await this.addTimelineEntry(id, dto.reason || `Priority changed from ${existing.priority} to ${dto.priority}`, 'priority_change', actorId);
    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.COMPLAINT,
      entityId: String(id),
      action: 'priority_change',
      oldStatus: existing.priority,
      newStatus: dto.priority,
      reason: dto.reason,
    });

    if (existing.assigned_to && PRIORITY_RANK[dto.priority] > PRIORITY_RANK[existing.priority]) {
      await this.notifications.send({
        entityType: 'complaint',
        entityId: id,
        eventType: 'complaint_priority_changed',
        recipientEmployeeId: existing.assigned_to,
        message: `Complaint #${id} priority raised to ${dto.priority}.`,
      });
    }

    return updated;
  }

  async changeStatus(id: number, dto: ChangeComplaintStatusDto, actorId?: string) {
    const existing = await this.assertExists(id);
    const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(`Cannot transition complaint from "${existing.status}" to "${dto.status}"`);
    }

    const updated = await this.prisma.frontOfficeComplaint.update({
      where: { complaint_id: id },
      data: { status: dto.status as any, resolved_at: dto.status === 'resolved' ? new Date() : existing.resolved_at },
    });

    const action = existing.status === dto.status ? 'status_change' : dto.status === 'open' && existing.status !== 'open' ? 'reopen' : 'status_change';
    await this.addTimelineEntry(id, dto.reason || `Status changed from ${existing.status} to ${dto.status}`, action, actorId);
    await this.audit.log({ userId: actorId, entityType: FO_ENTITY.COMPLAINT, entityId: String(id), action, oldStatus: existing.status, newStatus: dto.status, reason: dto.reason });

    if (existing.assigned_to) {
      await this.notifications.send({
        entityType: 'complaint',
        entityId: id,
        eventType: `complaint_${dto.status}`,
        recipientEmployeeId: existing.assigned_to,
        message: `Complaint #${id} is now ${dto.status}.`,
      });
    }

    return updated;
  }

  resolve(id: number, actorId?: string) {
    return this.changeStatus(id, { status: 'resolved' as any }, actorId);
  }

  close(id: number, actorId?: string) {
    return this.changeStatus(id, { status: 'closed' as any }, actorId);
  }

  async escalate(id: number, dto: EscalateComplaintDto, actorId?: string) {
    const existing = await this.assertExists(id);
    await this.assertEmployeeExists(dto.to_employee_id);

    const nextPriority = PRIORITY_RANK[existing.priority] < PRIORITY_RANK.high ? 'high' : existing.priority;

    const updated = await this.prisma.frontOfficeComplaint.update({
      where: { complaint_id: id },
      data: { assigned_to: dto.to_employee_id, priority: nextPriority as any },
    });

    await this.addTimelineEntry(id, dto.reason || `Escalated to employee #${dto.to_employee_id}`, 'escalated', actorId);
    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.COMPLAINT,
      entityId: String(id),
      action: 'escalate',
      oldStatus: existing.priority,
      newStatus: nextPriority,
      reason: dto.reason,
      metadata: { escalated_from: existing.assigned_to, escalated_to: dto.to_employee_id },
    });
    await this.notifications.send({
      entityType: 'complaint',
      entityId: id,
      eventType: 'complaint_escalated',
      recipientEmployeeId: dto.to_employee_id,
      message: `Complaint #${id} has been escalated to you.`,
    });

    return updated;
  }

  async addUpdate(id: number, dto: CreateComplaintUpdateDto, actorId?: string) {
    await this.assertExists(id);
    const update = await this.addTimelineEntry(id, dto.notes, undefined, actorId);
    await this.audit.log({ userId: actorId, entityType: FO_ENTITY.COMPLAINT_UPDATE, entityId: String(update.update_id), action: 'create', metadata: { complaint_id: id } });
    return update;
  }

  async listUpdates(id: number) {
    await this.assertExists(id);
    return this.prisma.frontOfficeComplaintUpdate.findMany({ where: { complaint_id: id }, orderBy: { updated_at: 'desc' } });
  }
}
