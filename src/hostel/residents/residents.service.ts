import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAuditService } from '../common/hostel-audit.service';
import { HostelLookupService } from '../common/hostel-lookup.service';
import { HostelNotificationService } from '../notifications/hostel-notification.service';
import { HOSTEL_ENTITY } from '../common/hostel-entities';
import { BusinessException } from '../common/business-exception';
import { orConflict } from '../common/unique-violation.util';
import { localToday, parseDateOnly } from '../common/time.util';
import {
  buildMeta,
  parsePagination,
  parseSort,
  parseSortOrder,
} from '../common/pagination.util';
import {
  CreateHostelResidentDto,
  QueryHostelResidentDto,
  UpdateHostelResidentDto,
} from './dto/resident.dto';

const SORT_FIELDS = [
  'student_name',
  'admission_no',
  'admitted_on',
  'status',
  'created_at',
] as const;

const CURRENT_ALLOTMENT_INCLUDE = {
  allotments: {
    where: { status: 'active' as const },
    take: 1,
    include: {
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
    },
  },
} satisfies Prisma.HostelResidentInclude;

/** Flattens `allotments[0]` into `current_allotment` so callers never see the internal one-element array. */
function withCurrentAllotment<T extends { allotments: unknown[] }>(row: T) {
  const { allotments, ...rest } = row;
  return { ...rest, current_allotment: allotments[0] ?? null };
}

@Injectable()
export class ResidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: HostelLookupService,
    private readonly audit: HostelAuditService,
    private readonly notifications: HostelNotificationService,
  ) {}

  async create(actor: HostelPlatformUser, dto: CreateHostelResidentDto) {
    const existing = await this.prisma.hostelResident.findUnique({
      where: {
        institute_id_student_ref: {
          institute_id: actor.institute_id,
          student_ref: dto.student_ref,
        },
      },
      select: { resident_id: true, status: true },
    });
    if (existing) {
      throw new BusinessException(
        'RESIDENT_ALREADY_REGISTERED',
        existing.status === 'vacated'
          ? 'This student is already registered as a hostel resident (vacated). Re-admit the existing resident instead.'
          : 'This student is already registered as a hostel resident',
        { resident_id: existing.resident_id, status: existing.status },
        409,
      );
    }
    const resident = await orConflict(
      'This student is already registered as a hostel resident',
      () =>
        this.prisma.hostelResident.create({
          data: {
            institute_id: actor.institute_id,
            student_ref: dto.student_ref,
            admission_no: dto.admission_no,
            student_name: dto.student_name,
            gender: dto.gender,
            grade: dto.grade,
            guardian_name: dto.guardian_name,
            guardian_phone: dto.guardian_phone,
            guardian_email: dto.guardian_email,
            admitted_on: dto.admitted_on
              ? parseDateOnly(dto.admitted_on, 'admitted_on')
              : localToday(),
            created_by: actor.eddva_user_id,
          },
        }),
    );
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.RESIDENT,
      entityId: String(resident.resident_id),
      action: 'create',
      metadata: { student_ref: resident.student_ref },
    });
    return resident;
  }

  async findAll(instituteId: string, query: QueryHostelResidentDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, 'student_name');

    // Placement filters all look at the CURRENT (active) allotment.
    const activeAllotment: Prisma.HostelRoomAllotmentWhereInput = {
      status: 'active',
      ...(query.room_id ? { room_id: query.room_id } : {}),
      ...(query.block_id ? { room: { block_id: query.block_id } } : {}),
      ...(query.academic_year ? { academic_year: query.academic_year } : {}),
    };
    const hasPlacementFilter = !!(
      query.room_id ||
      query.block_id ||
      query.academic_year
    );

    const where: Prisma.HostelResidentWhereInput = {
      institute_id: instituteId,
      status: query.status,
      gender: query.gender,
      ...(query.unallotted === true
        ? { allotments: { none: { status: 'active' } } }
        : hasPlacementFilter || query.unallotted === false
          ? { allotments: { some: activeAllotment } }
          : {}),
      ...(query.search
        ? {
            OR: [
              { student_name: { contains: query.search, mode: 'insensitive' } },
              { admission_no: { contains: query.search, mode: 'insensitive' } },
              { student_ref: { contains: query.search, mode: 'insensitive' } },
              { guardian_phone: { contains: query.search } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.hostelResident.findMany({
        where,
        include: CURRENT_ALLOTMENT_INCLUDE,
        orderBy: { [sortBy]: parseSortOrder(query.sortOrder ?? 'asc') },
        skip,
        take,
      }),
      this.prisma.hostelResident.count({ where }),
    ]);
    return {
      data: rows.map(withCurrentAllotment),
      pagination: buildMeta(total, page, limit),
    };
  }

  async findOne(instituteId: string, id: number) {
    await this.lookup.resident(instituteId, id);
    const row = await this.prisma.hostelResident.findFirstOrThrow({
      where: { resident_id: id, institute_id: instituteId },
      include: CURRENT_ALLOTMENT_INCLUDE,
    });
    return withCurrentAllotment(row);
  }

  async update(
    actor: HostelPlatformUser,
    id: number,
    dto: UpdateHostelResidentDto,
  ) {
    const before = await this.lookup.resident(actor.institute_id, id);
    if (dto.gender && dto.gender !== before.gender) {
      // Gender decides which blocks a resident may live in — never change it under a live allotment.
      const active = await this.prisma.hostelRoomAllotment.count({
        where: { resident_id: id, status: 'active' },
      });
      if (active > 0) {
        throw new ConflictException(
          'Gender cannot be changed while the resident holds an active room allotment. Vacate first.',
        );
      }
    }
    const updated = await this.prisma.hostelResident.update({
      where: { resident_id: id },
      data: {
        admission_no: dto.admission_no,
        student_name: dto.student_name,
        gender: dto.gender,
        grade: dto.grade,
        guardian_name: dto.guardian_name,
        guardian_phone: dto.guardian_phone,
        guardian_email: dto.guardian_email,
      },
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.RESIDENT,
      entityId: String(id),
      action: 'update',
      metadata: { fields: Object.keys(dto) },
    });
    return updated;
  }

  /**
   * Suspends an active resident. Passes that have not been used yet (pending /
   * approved) are cancelled — a suspended resident must not be able to walk out
   * on an old permit. A resident who is already out stays out until scanned in.
   */
  async suspend(actor: HostelPlatformUser, id: number, reason: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const resident = await this.lookup.lockResident(
        actor.institute_id,
        id,
        tx,
      );
      if (resident.status !== 'active') {
        throw new BusinessException(
          'INVALID_STATE_TRANSITION',
          `Only an active resident can be suspended (currently ${resident.status})`,
          { status: resident.status },
          409,
        );
      }
      await tx.hostelGatePass.updateMany({
        where: { resident_id: id, status: { in: ['pending', 'approved'] } },
        data: {
          status: 'cancelled',
          decision_remarks: 'Cancelled automatically: resident suspended',
          decided_at: new Date(),
        },
      });
      return tx.hostelResident.update({
        where: { resident_id: id },
        data: { status: 'suspended', status_reason: reason },
      });
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.RESIDENT,
      entityId: String(id),
      action: 'suspend',
      oldStatus: 'active',
      newStatus: 'suspended',
      reason,
    });
    await this.notifications.notifyGuardian(
      {
        instituteId: actor.institute_id,
        entityType: HOSTEL_ENTITY.RESIDENT,
        entityId: id,
        eventType: 'resident_suspended',
        message: `${updated.student_name} has been suspended from the hostel: ${reason}`,
      },
      updated,
    );
    return updated;
  }

  async reinstate(actor: HostelPlatformUser, id: number, remarks?: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const resident = await this.lookup.lockResident(
        actor.institute_id,
        id,
        tx,
      );
      if (resident.status !== 'suspended') {
        throw new BusinessException(
          'INVALID_STATE_TRANSITION',
          `Only a suspended resident can be reinstated (currently ${resident.status})`,
          { status: resident.status },
          409,
        );
      }
      return tx.hostelResident.update({
        where: { resident_id: id },
        data: { status: 'active', status_reason: remarks ?? null },
      });
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.RESIDENT,
      entityId: String(id),
      action: 'reinstate',
      oldStatus: 'suspended',
      newStatus: 'active',
      reason: remarks,
    });
    return updated;
  }

  /** A vacated resident who returns to the hostel keeps the same resident row (and therefore full history). */
  async readmit(actor: HostelPlatformUser, id: number, admittedOn?: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const resident = await this.lookup.lockResident(
        actor.institute_id,
        id,
        tx,
      );
      if (resident.status !== 'vacated') {
        throw new BusinessException(
          'INVALID_STATE_TRANSITION',
          `Only a vacated resident can be re-admitted (currently ${resident.status})`,
          { status: resident.status },
          409,
        );
      }
      return tx.hostelResident.update({
        where: { resident_id: id },
        data: {
          status: 'active',
          admitted_on: admittedOn
            ? parseDateOnly(admittedOn, 'admitted_on')
            : localToday(),
          vacated_on: null,
          status_reason: null,
        },
      });
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.RESIDENT,
      entityId: String(id),
      action: 'readmit',
      oldStatus: 'vacated',
      newStatus: 'active',
    });
    return updated;
  }
}
