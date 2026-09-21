import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAuditService } from '../common/hostel-audit.service';
import { HostelLookupService } from '../common/hostel-lookup.service';
import { HostelNotificationService } from '../notifications/hostel-notification.service';
import { HOSTEL_ENTITY } from '../common/hostel-entities';
import { BusinessException } from '../common/business-exception';
import { orConflict } from '../common/unique-violation.util';
import { localToday } from '../common/time.util';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
} from '../common/pagination.util';
import { AllotmentsService } from './allotments.service';
import {
  ApproveTransferRequestDto,
  CreateTransferRequestDto,
  QueryTransferRequestDto,
  RejectTransferRequestDto,
} from './dto/allotment.dto';

const REQUEST_INCLUDE = {
  resident: {
    select: {
      resident_id: true,
      student_name: true,
      admission_no: true,
      gender: true,
    },
  },
  current_room: {
    select: { room_id: true, room_number: true, block_id: true },
  },
  requested_room: {
    select: { room_id: true, room_number: true, block_id: true },
  },
} satisfies Prisma.HostelTransferRequestInclude;

@Injectable()
export class TransferRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: HostelLookupService,
    private readonly allotments: AllotmentsService,
    private readonly audit: HostelAuditService,
    private readonly notifications: HostelNotificationService,
  ) {}

  async create(
    actor: HostelPlatformUser,
    residentId: number,
    dto: CreateTransferRequestDto,
  ) {
    const requestedRoom = await this.lookup.room(
      actor.institute_id,
      dto.requested_room_id,
    );

    const request = await orConflict(
      'This resident already has a pending transfer request',
      () =>
        this.prisma.$transaction(async (tx) => {
          const resident = await this.lookup.lockResident(
            actor.institute_id,
            residentId,
            tx,
          );
          if (resident.status !== 'active') {
            throw new BusinessException(
              'RESIDENT_NOT_ACTIVE',
              `Resident is ${resident.status}; only active residents can request a transfer`,
              { status: resident.status },
            );
          }
          const current = await tx.hostelRoomAllotment.findFirst({
            where: { resident_id: residentId, status: 'active' },
          });
          if (!current) {
            throw new BusinessException(
              'NO_ACTIVE_ALLOTMENT',
              'Resident has no active room allotment to transfer from',
            );
          }
          if (
            current.room_id === requestedRoom.room_id &&
            !dto.requested_bed_id
          ) {
            throw new BusinessException(
              'SAME_PLACEMENT',
              'Resident is already in the requested room',
            );
          }
          const pending = await tx.hostelTransferRequest.count({
            where: { resident_id: residentId, status: 'pending' },
          });
          if (pending > 0) {
            throw new BusinessException(
              'TRANSFER_ALREADY_PENDING',
              'This resident already has a pending transfer request',
              undefined,
              HttpStatus.CONFLICT,
            );
          }
          return tx.hostelTransferRequest.create({
            data: {
              institute_id: actor.institute_id,
              resident_id: residentId,
              current_allotment_id: current.allotment_id,
              current_room_id: current.room_id,
              requested_room_id: requestedRoom.room_id,
              requested_bed_id: dto.requested_bed_id,
              reason: dto.reason,
              requested_by: actor.eddva_user_id,
            },
            include: REQUEST_INCLUDE,
          });
        }),
    );

    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.TRANSFER_REQUEST,
      entityId: String(request.transfer_id),
      action: 'create',
      newStatus: 'pending',
      reason: dto.reason,
      metadata: {
        resident_id: residentId,
        from_room_id: request.current_room_id,
        to_room_id: request.requested_room_id,
      },
    });
    const wardens = await this.prisma.hostelBlock.findMany({
      where: {
        block_id: {
          in: [request.current_room.block_id, request.requested_room.block_id],
        },
      },
      select: { warden_user_id: true },
    });
    await this.notifications.notifyStaff(
      {
        instituteId: actor.institute_id,
        entityType: HOSTEL_ENTITY.TRANSFER_REQUEST,
        entityId: request.transfer_id,
        eventType: 'transfer_requested',
        message: `${request.resident.student_name} requested a move from room ${request.current_room.room_number} to ${request.requested_room.room_number}.`,
      },
      wardens.map((w) => w.warden_user_id),
    );
    return request;
  }

  async findAll(instituteId: string, query: QueryTransferRequestDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const range = buildDateRange(query.from, query.to);
    const where: Prisma.HostelTransferRequestWhereInput = {
      institute_id: instituteId,
      resident_id: query.resident_id,
      status: query.status,
      current_room_id: query.current_room_id,
      requested_room_id: query.requested_room_id,
      ...(range ? { requested_at: range } : {}),
      ...(query.search
        ? {
            resident: {
              student_name: { contains: query.search, mode: 'insensitive' },
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.hostelTransferRequest.findMany({
        where,
        include: REQUEST_INCLUDE,
        orderBy: { requested_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.hostelTransferRequest.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const row = await this.prisma.hostelTransferRequest.findFirst({
      where: { transfer_id: id, institute_id: instituteId },
      include: { ...REQUEST_INCLUDE, new_allotment: true },
    });
    if (!row) throw new NotFoundException(`Transfer request #${id} not found`);
    return row;
  }

  /**
   * Approve = validate the requested room/bed, close the current allotment as
   * `transferred`, open the new one and mark the request approved — all in one
   * transaction. The request is claimed with a conditional update (still
   * `pending`), so two approvers can never both move the resident.
   */
  async approve(
    actor: HostelPlatformUser,
    id: number,
    dto: ApproveTransferRequestDto,
  ) {
    const request = await this.findOne(actor.institute_id, id);

    const result = await orConflict(
      'That bed was just taken; choose another bed',
      () =>
        this.prisma.$transaction(async (tx) => {
          const claimed = await tx.hostelTransferRequest.updateMany({
            where: {
              transfer_id: id,
              institute_id: actor.institute_id,
              status: 'pending',
            },
            data: {
              status: 'approved',
              decided_by: actor.eddva_user_id,
              decided_at: new Date(),
              decision_remarks: dto.remarks,
            },
          });
          if (claimed.count === 0) {
            throw new BusinessException(
              'INVALID_STATE_TRANSITION',
              'Transfer request is no longer pending',
              undefined,
              HttpStatus.CONFLICT,
            );
          }
          const moved = await this.allotments.transferInTx(
            tx,
            actor,
            request.resident_id,
            {
              roomId: request.requested_room_id,
              bedId: dto.bed_id ?? request.requested_bed_id,
              date: localToday(),
              reason: request.reason,
              transferRequestId: id,
            },
          );
          // The request must describe the allotment the resident is really leaving.
          if (moved.closed.allotment_id !== request.current_allotment_id) {
            throw new BusinessException(
              'TRANSFER_REQUEST_STALE',
              'The resident has changed rooms since this request was raised. Reject it and raise a new one.',
              undefined,
              HttpStatus.CONFLICT,
            );
          }
          await tx.hostelTransferRequest.update({
            where: { transfer_id: id },
            data: { new_allotment_id: moved.created.allotment_id },
          });
          return moved;
        }),
    );

    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.TRANSFER_REQUEST,
      entityId: String(id),
      action: 'approve',
      oldStatus: 'pending',
      newStatus: 'approved',
      reason: dto.remarks,
      metadata: { new_allotment_id: result.created.allotment_id },
    });
    await this.allotments.auditTransfer(actor, result, request.reason, id);
    await this.allotments.notifyTransfer(
      actor.institute_id,
      result.resident,
      result.created.room_id,
      result.created.allotment_id,
    );
    return this.findOne(actor.institute_id, id);
  }

  async reject(
    actor: HostelPlatformUser,
    id: number,
    dto: RejectTransferRequestDto,
  ) {
    const request = await this.decide(actor, id, 'rejected', dto.remarks);
    await this.notifications.notifyGuardian(
      {
        instituteId: actor.institute_id,
        entityType: HOSTEL_ENTITY.TRANSFER_REQUEST,
        entityId: id,
        eventType: 'transfer_rejected',
        message: `Room transfer request for ${request.resident.student_name} was rejected: ${dto.remarks}`,
      },
      await this.lookup.resident(actor.institute_id, request.resident_id),
    );
    return request;
  }

  cancel(actor: HostelPlatformUser, id: number) {
    return this.decide(actor, id, 'cancelled', undefined);
  }

  private async decide(
    actor: HostelPlatformUser,
    id: number,
    status: 'rejected' | 'cancelled',
    remarks?: string,
  ) {
    await this.findOne(actor.institute_id, id);
    const claimed = await this.prisma.hostelTransferRequest.updateMany({
      where: {
        transfer_id: id,
        institute_id: actor.institute_id,
        status: 'pending',
      },
      data: {
        status,
        decided_by: actor.eddva_user_id,
        decided_at: new Date(),
        decision_remarks: remarks,
      },
    });
    if (claimed.count === 0) {
      throw new BusinessException(
        'INVALID_STATE_TRANSITION',
        'Transfer request is no longer pending',
        undefined,
        HttpStatus.CONFLICT,
      );
    }
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.TRANSFER_REQUEST,
      entityId: String(id),
      action: status === 'rejected' ? 'reject' : 'cancel',
      oldStatus: 'pending',
      newStatus: status,
      reason: remarks,
    });
    return this.findOne(actor.institute_id, id);
  }
}
