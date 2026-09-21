import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAuditService } from '../common/hostel-audit.service';
import { HostelLookupService } from '../common/hostel-lookup.service';
import { HostelOccupancyService } from '../common/hostel-occupancy.service';
import { HostelNotificationService } from '../notifications/hostel-notification.service';
import { HOSTEL_ENTITY } from '../common/hostel-entities';
import { BusinessException } from '../common/business-exception';
import { orConflict } from '../common/unique-violation.util';
import { localToday, parseDateOnly } from '../common/time.util';
import {
  isValidAcademicYear,
  ACADEMIC_YEAR_MESSAGE,
} from '../common/validation';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
} from '../common/pagination.util';
import { PageQueryDto } from '../common/page-query.dto';
import {
  CreateAllotmentDto,
  QueryAllotmentDto,
  TransferResidentDto,
  VacateResidentDto,
} from './dto/allotment.dto';

const ALLOTMENT_INCLUDE = {
  room: {
    select: {
      room_id: true,
      room_number: true,
      floor: true,
      room_type: true,
      block: { select: { block_id: true, name: true, gender_type: true } },
    },
  },
  bed: { select: { bed_id: true, bed_number: true } },
} satisfies Prisma.HostelRoomAllotmentInclude;

export interface TransferTarget {
  roomId: number;
  bedId?: number | null;
  academicYear?: string;
  date: Date;
  reason: string;
  transferRequestId?: number;
}

/**
 * Room allotment, vacate and transfer. History-preserving by construction:
 * every stay is its own `hostel_room_allotments` row; vacating or transferring
 * closes the row (status vacated/transferred + vacate_date) and never edits it
 * back. The invariants themselves live in HostelOccupancyService.
 */
@Injectable()
export class AllotmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: HostelLookupService,
    private readonly occupancy: HostelOccupancyService,
    private readonly audit: HostelAuditService,
    private readonly notifications: HostelNotificationService,
  ) {}

  private assertAcademicYear(value: string) {
    if (!isValidAcademicYear(value)) {
      throw new BadRequestException(ACADEMIC_YEAR_MESSAGE);
    }
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(
    actor: HostelPlatformUser,
    residentId: number,
    dto: CreateAllotmentDto,
  ) {
    this.assertAcademicYear(dto.academic_year);
    const allotmentDate = dto.allotment_date
      ? parseDateOnly(dto.allotment_date, 'allotment_date')
      : localToday();
    await this.lookup.resident(actor.institute_id, residentId);

    const { allotment, resident } = await orConflict(
      'Resident already has an active allotment, or that bed was just taken',
      () =>
        this.prisma.$transaction(async (tx) => {
          const resident = await this.lookup.lockResident(
            actor.institute_id,
            residentId,
            tx,
          );
          const allotment = await this.occupancy.openAllotment(tx, {
            instituteId: actor.institute_id,
            resident,
            roomId: dto.room_id,
            bedId: dto.bed_id,
            academicYear: dto.academic_year,
            allotmentDate,
            allottedBy: actor.eddva_user_id,
          });
          return { allotment, resident };
        }),
    );

    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.ALLOTMENT,
      entityId: String(allotment.allotment_id),
      action: 'allot',
      newStatus: 'active',
      metadata: {
        resident_id: residentId,
        room_id: allotment.room_id,
        bed_id: allotment.bed_id,
        academic_year: allotment.academic_year,
      },
    });
    const full = await this.findOne(actor.institute_id, allotment.allotment_id);
    await this.notifications.notifyGuardian(
      {
        instituteId: actor.institute_id,
        entityType: HOSTEL_ENTITY.ALLOTMENT,
        entityId: allotment.allotment_id,
        eventType: 'room_allotted',
        message: `${resident.student_name} has been allotted room ${full.room.room_number} (${full.room.block.name}).`,
      },
      resident,
    );
    return full;
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  async findOne(instituteId: string, id: number) {
    await this.lookup.allotment(instituteId, id);
    return this.prisma.hostelRoomAllotment.findFirstOrThrow({
      where: { allotment_id: id },
      include: { ...ALLOTMENT_INCLUDE, resident: true },
    });
  }

  /** The resident's ACTIVE allotment, or null when they are not currently placed. */
  async current(instituteId: string, residentId: number) {
    await this.lookup.resident(instituteId, residentId);
    return this.prisma.hostelRoomAllotment.findFirst({
      where: {
        institute_id: instituteId,
        resident_id: residentId,
        status: 'active',
      },
      include: ALLOTMENT_INCLUDE,
    });
  }

  async history(instituteId: string, residentId: number, query: PageQueryDto) {
    await this.lookup.resident(instituteId, residentId);
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.HostelRoomAllotmentWhereInput = {
      institute_id: instituteId,
      resident_id: residentId,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.hostelRoomAllotment.findMany({
        where,
        include: ALLOTMENT_INCLUDE,
        orderBy: [{ allotment_date: 'desc' }, { allotment_id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.hostelRoomAllotment.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async roomHistory(instituteId: string, roomId: number, query: PageQueryDto) {
    await this.lookup.room(instituteId, roomId);
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.HostelRoomAllotmentWhereInput = {
      institute_id: instituteId,
      room_id: roomId,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.hostelRoomAllotment.findMany({
        where,
        include: {
          bed: { select: { bed_id: true, bed_number: true } },
          resident: {
            select: {
              resident_id: true,
              student_name: true,
              admission_no: true,
            },
          },
        },
        orderBy: [{ allotment_date: 'desc' }, { allotment_id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.hostelRoomAllotment.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findAll(instituteId: string, query: QueryAllotmentDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const range = buildDateRange(query.from, query.to);
    const where: Prisma.HostelRoomAllotmentWhereInput = {
      institute_id: instituteId,
      resident_id: query.resident_id,
      room_id: query.room_id,
      status: query.status,
      academic_year: query.academic_year,
      ...(query.block_id ? { room: { block_id: query.block_id } } : {}),
      ...(range ? { allotment_date: range } : {}),
      ...(query.search
        ? {
            resident: {
              OR: [
                {
                  student_name: { contains: query.search, mode: 'insensitive' },
                },
                {
                  admission_no: { contains: query.search, mode: 'insensitive' },
                },
              ],
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.hostelRoomAllotment.findMany({
        where,
        include: {
          ...ALLOTMENT_INCLUDE,
          resident: {
            select: {
              resident_id: true,
              student_name: true,
              admission_no: true,
              gender: true,
            },
          },
        },
        orderBy: [{ allotment_date: 'desc' }, { allotment_id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.hostelRoomAllotment.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  // ─── Vacate ───────────────────────────────────────────────────────────────

  async vacate(
    actor: HostelPlatformUser,
    residentId: number,
    dto: VacateResidentDto,
  ) {
    const vacateDate = dto.vacate_date
      ? parseDateOnly(dto.vacate_date, 'vacate_date')
      : localToday();
    await this.lookup.resident(actor.institute_id, residentId);

    const result = await this.prisma.$transaction(async (tx) => {
      const resident = await this.lookup.lockResident(
        actor.institute_id,
        residentId,
        tx,
      );
      if (resident.status === 'vacated') {
        throw new BusinessException(
          'INVALID_STATE_TRANSITION',
          'Resident has already vacated the hostel',
          { status: resident.status },
          409,
        );
      }
      // Someone who is outside the gate must come back through the gate before leaving for good.
      const out = await tx.hostelGatePass.count({
        where: { resident_id: residentId, status: { in: ['out', 'overdue'] } },
      });
      if (out > 0) {
        throw new BusinessException(
          'RESIDENT_OUT',
          'Resident is currently out on a gate pass. Scan them in before vacating.',
          undefined,
          409,
        );
      }

      const allotment = await tx.hostelRoomAllotment.findFirst({
        where: { resident_id: residentId, status: 'active' },
      });
      if (allotment) {
        await this.occupancy.closeAllotment(tx, allotment, {
          status: 'vacated',
          vacateDate,
          closedBy: actor.eddva_user_id,
          reason: dto.reason,
        });
      }
      // Unused permits and open transfer requests die with the stay.
      await tx.hostelGatePass.updateMany({
        where: {
          resident_id: residentId,
          status: { in: ['pending', 'approved'] },
        },
        data: {
          status: 'cancelled',
          decision_remarks: 'Cancelled automatically: resident vacated',
          decided_at: new Date(),
        },
      });
      await tx.hostelTransferRequest.updateMany({
        where: { resident_id: residentId, status: 'pending' },
        data: {
          status: 'cancelled',
          decision_remarks: 'Cancelled automatically: resident vacated',
          decided_at: new Date(),
        },
      });
      const updated = await tx.hostelResident.update({
        where: { resident_id: residentId },
        data: {
          status: 'vacated',
          vacated_on: vacateDate,
          status_reason: dto.reason ?? null,
        },
      });
      return { resident: updated, allotment, previousStatus: resident.status };
    });

    const [billed, paid] = await Promise.all([
      this.prisma.hostelFeeInvoice.aggregate({
        where: { resident_id: residentId, cancelled_at: null },
        _sum: { amount_due: true },
      }),
      this.prisma.hostelFeeInvoice.aggregate({
        where: { resident_id: residentId, cancelled_at: null },
        _sum: { amount_paid: true },
      }),
    ]);
    const outstanding = new Prisma.Decimal(billed._sum.amount_due ?? 0).minus(
      paid._sum.amount_paid ?? 0,
    );

    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.RESIDENT,
      entityId: String(residentId),
      action: 'vacate',
      oldStatus: result.previousStatus,
      newStatus: 'vacated',
      reason: dto.reason,
      metadata: {
        allotment_id: result.allotment?.allotment_id ?? null,
        vacate_date: vacateDate,
      },
    });
    if (result.allotment) {
      await this.audit.log(actor, {
        entityType: HOSTEL_ENTITY.ALLOTMENT,
        entityId: String(result.allotment.allotment_id),
        action: 'vacate',
        oldStatus: 'active',
        newStatus: 'vacated',
        reason: dto.reason,
      });
    }
    await this.notifications.notifyGuardian(
      {
        instituteId: actor.institute_id,
        entityType: HOSTEL_ENTITY.RESIDENT,
        entityId: residentId,
        eventType: 'resident_vacated',
        message: `${result.resident.student_name} has vacated the hostel.`,
      },
      result.resident,
    );
    return {
      resident: result.resident,
      vacated_allotment_id: result.allotment?.allotment_id ?? null,
      outstanding_fee_balance: outstanding.toFixed(2),
    };
  }

  // ─── Transfer ─────────────────────────────────────────────────────────────

  /**
   * Closes the resident's active allotment as `transferred` and opens a new one
   * at the target — one atomic step, the old row is preserved. Runs inside the
   * caller's transaction so a failure (full room, taken bed…) leaves the resident
   * exactly where they were. Used by direct transfers and request approval.
   */
  async transferInTx(
    tx: Prisma.TransactionClient,
    actor: HostelPlatformUser,
    residentId: number,
    target: TransferTarget,
  ) {
    const resident = await this.lookup.lockResident(
      actor.institute_id,
      residentId,
      tx,
    );
    if (resident.status !== 'active') {
      throw new BusinessException(
        'RESIDENT_NOT_ACTIVE',
        `Resident is ${resident.status}; only active residents can be transferred`,
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
      current.room_id === target.roomId &&
      (target.bedId ?? null) === current.bed_id
    ) {
      throw new BusinessException(
        'SAME_PLACEMENT',
        'Resident is already in that room/bed',
      );
    }

    await this.lookup.lockRooms(
      actor.institute_id,
      [current.room_id, target.roomId],
      tx,
    );
    await this.occupancy.closeAllotment(tx, current, {
      status: 'transferred',
      vacateDate: target.date,
      closedBy: actor.eddva_user_id,
      reason: target.reason,
    });
    const created = await this.occupancy.openAllotment(tx, {
      instituteId: actor.institute_id,
      resident,
      roomId: target.roomId,
      bedId: target.bedId,
      academicYear: target.academicYear ?? current.academic_year,
      allotmentDate: target.date,
      allottedBy: actor.eddva_user_id,
    });
    return { resident, closed: current, created };
  }

  async transfer(
    actor: HostelPlatformUser,
    residentId: number,
    dto: TransferResidentDto,
  ) {
    if (dto.academic_year) this.assertAcademicYear(dto.academic_year);
    const date = dto.transfer_date
      ? parseDateOnly(dto.transfer_date, 'transfer_date')
      : localToday();
    await this.lookup.resident(actor.institute_id, residentId);

    const result = await orConflict(
      'That bed was just taken or the resident already changed rooms',
      () =>
        this.prisma.$transaction(async (tx) => {
          const moved = await this.transferInTx(tx, actor, residentId, {
            roomId: dto.room_id,
            bedId: dto.bed_id,
            academicYear: dto.academic_year,
            date,
            reason: dto.reason,
          });
          // A direct transfer settles any request the resident had open.
          await tx.hostelTransferRequest.updateMany({
            where: { resident_id: residentId, status: 'pending' },
            data: {
              status: 'cancelled',
              decision_remarks: 'Superseded by a direct transfer',
              decided_by: actor.eddva_user_id,
              decided_at: new Date(),
            },
          });
          return moved;
        }),
    );
    await this.auditTransfer(actor, result, dto.reason);
    await this.notifyTransfer(
      actor.institute_id,
      result.resident,
      result.created.room_id,
      result.created.allotment_id,
    );
    return this.findOne(actor.institute_id, result.created.allotment_id);
  }

  async auditTransfer(
    actor: HostelPlatformUser,
    result: {
      closed: { allotment_id: number; room_id: number };
      created: { allotment_id: number; room_id: number };
    },
    reason: string,
    transferRequestId?: number,
  ) {
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.ALLOTMENT,
      entityId: String(result.closed.allotment_id),
      action: 'transfer_out',
      oldStatus: 'active',
      newStatus: 'transferred',
      reason,
      metadata: {
        to_allotment_id: result.created.allotment_id,
        to_room_id: result.created.room_id,
        transfer_request_id: transferRequestId,
      },
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.ALLOTMENT,
      entityId: String(result.created.allotment_id),
      action: 'transfer_in',
      newStatus: 'active',
      reason,
      metadata: {
        from_allotment_id: result.closed.allotment_id,
        from_room_id: result.closed.room_id,
        transfer_request_id: transferRequestId,
      },
    });
  }

  async notifyTransfer(
    instituteId: string,
    resident: {
      student_name: string;
      guardian_phone: string;
      guardian_email: string | null;
    },
    newRoomId: number,
    allotmentId: number,
  ) {
    const room = await this.prisma.hostelRoom.findUnique({
      where: { room_id: newRoomId },
      select: { room_number: true, block: { select: { name: true } } },
    });
    await this.notifications.notifyGuardian(
      {
        instituteId,
        entityType: HOSTEL_ENTITY.ALLOTMENT,
        entityId: allotmentId,
        eventType: 'room_transferred',
        message: `${resident.student_name} has been moved to room ${room?.room_number ?? ''} (${room?.block.name ?? ''}).`,
      },
      resident,
    );
  }
}
