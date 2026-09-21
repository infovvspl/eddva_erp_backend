import { HttpStatus, Injectable } from '@nestjs/common';
import { HostelComplaintStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAuditService } from '../common/hostel-audit.service';
import { HostelLookupService } from '../common/hostel-lookup.service';
import { HostelNotificationService } from '../notifications/hostel-notification.service';
import { HOSTEL_ENTITY } from '../common/hostel-entities';
import { BusinessException } from '../common/business-exception';
import {
  COMPLAINT_TRANSITIONS,
  assertTransition,
} from '../common/hostel-state';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
} from '../common/pagination.util';
import {
  AssignHostelComplaintDto,
  CreateHostelComplaintDto,
  CreateHostelComplaintUpdateDto,
  QueryHostelComplaintDto,
  UpdateHostelComplaintDto,
} from './dto/complaint.dto';

const LIST_INCLUDE = {
  resident: {
    select: { resident_id: true, student_name: true, admission_no: true },
  },
  room: {
    select: {
      room_id: true,
      room_number: true,
      block: { select: { block_id: true, name: true } },
    },
  },
} satisfies Prisma.HostelComplaintInclude;

/**
 * Hostel complaints & maintenance. Same shape as the Front Office complaint
 * register (complaint + append-only timeline of updates carrying a
 * status_change), with a stricter status workflow enforced on the server.
 */
@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: HostelLookupService,
    private readonly audit: HostelAuditService,
    private readonly notifications: HostelNotificationService,
  ) {}

  private timeline(
    tx: Prisma.TransactionClient,
    complaintId: number,
    notes: string,
    statusChange: string | undefined,
    actor: HostelPlatformUser,
  ) {
    return tx.hostelComplaintUpdate.create({
      data: {
        complaint_id: complaintId,
        notes,
        status_change: statusChange,
        updated_by: actor.eddva_user_id,
      },
    });
  }

  private async blockWardenOfRoom(
    roomId: number | null,
  ): Promise<string | null> {
    if (!roomId) return null;
    const room = await this.prisma.hostelRoom.findUnique({
      where: { room_id: roomId },
      select: { block: { select: { warden_user_id: true } } },
    });
    return room?.block.warden_user_id ?? null;
  }

  async create(actor: HostelPlatformUser, dto: CreateHostelComplaintDto) {
    if (!dto.resident_id && !dto.room_id) {
      throw new BusinessException(
        'COMPLAINT_TARGET_REQUIRED',
        'Provide resident_id, room_id or both',
      );
    }
    let roomId = dto.room_id ?? null;
    if (dto.resident_id) {
      await this.lookup.resident(actor.institute_id, dto.resident_id);
      if (!roomId) {
        const current = await this.prisma.hostelRoomAllotment.findFirst({
          where: { resident_id: dto.resident_id, status: 'active' },
          select: { room_id: true },
        });
        roomId = current?.room_id ?? null;
      }
    }
    if (roomId) await this.lookup.room(actor.institute_id, roomId);

    const complaint = await this.prisma.$transaction(async (tx) => {
      const created = await tx.hostelComplaint.create({
        data: {
          institute_id: actor.institute_id,
          resident_id: dto.resident_id,
          room_id: roomId,
          category: dto.category,
          description: dto.description,
          priority: dto.priority ?? 'medium',
          created_by: actor.eddva_user_id,
        },
        include: LIST_INCLUDE,
      });
      await this.timeline(
        tx,
        created.complaint_id,
        'Complaint registered',
        undefined,
        actor,
      );
      return created;
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.COMPLAINT,
      entityId: String(complaint.complaint_id),
      action: 'create',
      newStatus: 'open',
      metadata: { category: complaint.category, priority: complaint.priority },
    });
    if (complaint.priority === 'urgent' || complaint.priority === 'high') {
      await this.notifications.notifyStaff(
        {
          instituteId: actor.institute_id,
          entityType: HOSTEL_ENTITY.COMPLAINT,
          entityId: complaint.complaint_id,
          eventType: 'complaint_raised',
          message: `${complaint.priority} ${complaint.category} complaint raised${complaint.room ? ` for room ${complaint.room.room_number}` : ''}.`,
        },
        [await this.blockWardenOfRoom(complaint.room_id)],
      );
    }
    return complaint;
  }

  async findAll(instituteId: string, query: QueryHostelComplaintDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const range = buildDateRange(query.from, query.to);
    const where: Prisma.HostelComplaintWhereInput = {
      institute_id: instituteId,
      status: query.status,
      priority: query.priority,
      category: query.category,
      assigned_to: query.assigned_to,
      resident_id: query.resident_id,
      room_id: query.room_id,
      ...(query.block_id ? { room: { block_id: query.block_id } } : {}),
      ...(range ? { created_at: range } : {}),
      ...(query.search
        ? {
            OR: [
              { description: { contains: query.search, mode: 'insensitive' } },
              {
                resident: {
                  student_name: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                room: {
                  room_number: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.hostelComplaint.findMany({
        where,
        include: LIST_INCLUDE,
        // enum order is low < medium < high < urgent, so `desc` lists the most urgent first
        orderBy: [{ priority: 'desc' }, { created_at: 'desc' }],
        skip,
        take,
      }),
      this.prisma.hostelComplaint.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    await this.lookup.complaint(instituteId, id);
    return this.prisma.hostelComplaint.findFirstOrThrow({
      where: { complaint_id: id },
      include: {
        ...LIST_INCLUDE,
        updates: { orderBy: { updated_at: 'desc' } },
      },
    });
  }

  async update(
    actor: HostelPlatformUser,
    id: number,
    dto: UpdateHostelComplaintDto,
  ) {
    const before = await this.lookup.complaint(actor.institute_id, id);
    if (before.status === 'closed') {
      throw new BusinessException(
        'COMPLAINT_CLOSED',
        'A closed complaint can no longer be edited',
        undefined,
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.hostelComplaint.update({
        where: { complaint_id: id },
        data: {
          category: dto.category,
          description: dto.description,
          priority: dto.priority,
        },
        include: LIST_INCLUDE,
      });
      if (dto.priority && dto.priority !== before.priority) {
        await this.timeline(
          tx,
          id,
          `Priority changed from ${before.priority} to ${dto.priority}`,
          'priority_change',
          actor,
        );
      }
      return row;
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.COMPLAINT,
      entityId: String(id),
      action: 'update',
      metadata: { changes: dto },
    });
    return updated;
  }

  async assign(
    actor: HostelPlatformUser,
    id: number,
    dto: AssignHostelComplaintDto,
  ) {
    const before = await this.lookup.complaint(actor.institute_id, id);
    if (before.status === 'closed' || before.status === 'resolved') {
      throw new BusinessException(
        'INVALID_STATE_TRANSITION',
        `A ${before.status} complaint cannot be assigned`,
        { status: before.status },
        HttpStatus.CONFLICT,
      );
    }
    const staff = await this.lookup.staffMember(
      actor.institute_id,
      dto.assigned_to,
    );
    const action = before.assigned_to ? 'reassign' : 'assign';
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.hostelComplaint.update({
        where: { complaint_id: id },
        data: {
          assigned_to: staff.eddva_user_id,
          assigned_to_name: staff.user_name,
        },
        include: LIST_INCLUDE,
      });
      await this.timeline(
        tx,
        id,
        dto.notes ?? `Complaint ${action}ed to ${staff.user_name}`,
        action,
        actor,
      );
      return row;
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.COMPLAINT,
      entityId: String(id),
      action,
      oldStatus: before.assigned_to ?? undefined,
      newStatus: staff.eddva_user_id,
      reason: dto.notes,
    });
    await this.notifications.notifyStaff(
      {
        instituteId: actor.institute_id,
        entityType: HOSTEL_ENTITY.COMPLAINT,
        entityId: id,
        eventType: 'complaint_assigned',
        message: `Hostel complaint #${id} (${updated.priority} ${updated.category}) has been assigned to you.`,
      },
      [staff.eddva_user_id],
    );
    return updated;
  }

  /**
   * Moves the complaint along its workflow (open → in_progress → resolved →
   * closed; a resolved one may be re-opened to in_progress). The write is
   * conditional on the status we validated against, so two people changing it
   * at once can't both win.
   */
  async changeStatus(
    actor: HostelPlatformUser,
    id: number,
    to: HostelComplaintStatus,
    notes?: string,
    resolutionNotes?: string,
  ) {
    const before = await this.lookup.complaint(actor.institute_id, id);
    assertTransition(COMPLAINT_TRANSITIONS, before.status, to, 'Complaint');
    if (
      to === 'resolved' &&
      !resolutionNotes &&
      !before.resolution_notes &&
      !notes
    ) {
      throw new BusinessException(
        'RESOLUTION_NOTES_REQUIRED',
        'Explain how the complaint was resolved',
      );
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.hostelComplaint.updateMany({
        where: {
          complaint_id: id,
          institute_id: actor.institute_id,
          status: before.status,
        },
        data: {
          status: to,
          ...(to === 'resolved'
            ? {
                resolved_at: now,
                resolution_notes:
                  resolutionNotes ?? notes ?? before.resolution_notes,
              }
            : {}),
          ...(to === 'closed' ? { closed_at: now } : {}),
          // re-opening clears the resolution
          ...(to === 'in_progress' && before.status === 'resolved'
            ? { resolved_at: null }
            : {}),
        },
      });
      if (claimed.count === 0) {
        throw new BusinessException(
          'INVALID_STATE_TRANSITION',
          'The complaint status changed while you were updating it',
          undefined,
          HttpStatus.CONFLICT,
        );
      }
      await this.timeline(
        tx,
        id,
        notes ??
          resolutionNotes ??
          `Status changed from ${before.status} to ${to}`,
        `${before.status}→${to}`,
        actor,
      );
      return tx.hostelComplaint.findFirstOrThrow({
        where: { complaint_id: id },
        include: LIST_INCLUDE,
      });
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.COMPLAINT,
      entityId: String(id),
      action:
        to === 'resolved'
          ? 'resolve'
          : to === 'closed'
            ? 'close'
            : 'status_change',
      oldStatus: before.status,
      newStatus: to,
      reason: notes ?? resolutionNotes,
    });
    if (to === 'resolved' && updated.resident_id) {
      const resident = await this.prisma.hostelResident.findUnique({
        where: { resident_id: updated.resident_id },
        select: { guardian_phone: true, guardian_email: true },
      });
      if (resident) {
        await this.notifications.notifyGuardian(
          {
            instituteId: actor.institute_id,
            entityType: HOSTEL_ENTITY.COMPLAINT,
            entityId: id,
            eventType: 'complaint_resolved',
            message: `Hostel complaint #${id} (${updated.category}) has been resolved.`,
          },
          resident,
        );
      }
    }
    return updated;
  }

  resolve(actor: HostelPlatformUser, id: number, resolutionNotes: string) {
    return this.changeStatus(actor, id, 'resolved', undefined, resolutionNotes);
  }

  close(actor: HostelPlatformUser, id: number, notes?: string) {
    return this.changeStatus(actor, id, 'closed', notes);
  }

  // ─── Timeline ─────────────────────────────────────────────────────────────

  async addUpdate(
    actor: HostelPlatformUser,
    id: number,
    dto: CreateHostelComplaintUpdateDto,
  ) {
    await this.lookup.complaint(actor.institute_id, id);
    const entry = await this.timeline(
      this.prisma,
      id,
      dto.notes,
      undefined,
      actor,
    );
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.COMPLAINT,
      entityId: String(id),
      action: 'note',
    });
    return entry;
  }

  async listUpdates(instituteId: string, id: number) {
    await this.lookup.complaint(instituteId, id);
    return this.prisma.hostelComplaintUpdate.findMany({
      where: { complaint_id: id },
      orderBy: { updated_at: 'desc' },
    });
  }

  /** Only the status/assignment/priority changes from the timeline — the complaint's history. */
  async history(instituteId: string, id: number) {
    await this.lookup.complaint(instituteId, id);
    return this.prisma.hostelComplaintUpdate.findMany({
      where: { complaint_id: id, status_change: { not: null } },
      orderBy: { updated_at: 'asc' },
    });
  }
}
