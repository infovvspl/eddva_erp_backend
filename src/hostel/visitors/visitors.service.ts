import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAccessService } from '../common/hostel-access.service';
import { HostelAuditService } from '../common/hostel-audit.service';
import { HostelLookupService } from '../common/hostel-lookup.service';
import { HOSTEL_ENTITY } from '../common/hostel-entities';
import { BusinessException } from '../common/business-exception';
import {
  decryptIdProof,
  encryptIdProof,
  maskIdProof,
} from '../common/id-proof-crypto.util';
import { dayRange, localToday, parseDateTime } from '../common/time.util';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
} from '../common/pagination.util';
import { CreateVisitorLogDto, QueryVisitorLogDto } from './dto/visitor.dto';

const RESIDENT_SELECT = {
  resident: {
    select: { resident_id: true, student_name: true, admission_no: true },
  },
} satisfies Prisma.HostelVisitorLogInclude;

/** Clock skew tolerance for a client-supplied in_time. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

type VisitorRow = Prisma.HostelVisitorLogGetPayload<{
  include: typeof RESIDENT_SELECT;
}>;

@Injectable()
export class VisitorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: HostelLookupService,
    private readonly access: HostelAccessService,
    private readonly audit: HostelAuditService,
  ) {}

  /**
   * The encrypted blob never leaves the service. Everyone gets the masked
   * last-4; the full number is decrypted only for holders of visitors:view_id.
   */
  private present(row: VisitorRow, canViewId: boolean) {
    const { id_proof_encrypted, ...rest } = row;
    return {
      ...rest,
      ...(canViewId && id_proof_encrypted
        ? { id_proof_number: decryptIdProof(id_proof_encrypted) }
        : {}),
    };
  }

  private canViewId(actor: HostelPlatformUser) {
    return this.access.hasPermission(actor, 'visitors', 'view_id');
  }

  async create(actor: HostelPlatformUser, dto: CreateVisitorLogDto) {
    const resident = await this.lookup.resident(
      actor.institute_id,
      dto.resident_id,
    );
    if (resident.status === 'vacated') {
      throw new BusinessException(
        'RESIDENT_NOT_ACTIVE',
        'Resident has vacated the hostel; visits cannot be logged',
        { status: resident.status },
      );
    }
    const inTime = dto.in_time
      ? parseDateTime(dto.in_time, 'in_time')
      : new Date();
    if (inTime.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BusinessException(
        'INVALID_VISIT_TIME',
        'in_time cannot be in the future',
      );
    }
    const row = await this.prisma.hostelVisitorLog.create({
      data: {
        institute_id: actor.institute_id,
        resident_id: dto.resident_id,
        visitor_name: dto.visitor_name,
        relation: dto.relation,
        purpose: dto.purpose,
        id_proof_type: dto.id_proof_type,
        id_proof_masked: dto.id_proof_number
          ? maskIdProof(dto.id_proof_number)
          : null,
        id_proof_encrypted: dto.id_proof_number
          ? encryptIdProof(dto.id_proof_number)
          : null,
        in_time: inTime,
        recorded_by: actor.eddva_user_id,
      },
      include: RESIDENT_SELECT,
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.VISITOR,
      entityId: String(row.visitor_log_id),
      action: 'check_in',
      // never put the ID proof number in the audit trail
      metadata: {
        resident_id: row.resident_id,
        visitor_name: row.visitor_name,
        relation: row.relation,
      },
    });
    return this.present(row, await this.canViewId(actor));
  }

  private where(
    instituteId: string,
    query: QueryVisitorLogDto,
  ): Prisma.HostelVisitorLogWhereInput {
    const range = buildDateRange(query.from, query.to);
    return {
      institute_id: instituteId,
      resident_id: query.resident_id,
      ...(range ? { in_time: range } : {}),
      ...(query.active === true ? { out_time: null } : {}),
      ...(query.active === false ? { out_time: { not: null } } : {}),
      ...(query.search
        ? {
            OR: [
              { visitor_name: { contains: query.search, mode: 'insensitive' } },
              {
                resident: {
                  student_name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
  }

  private async page(
    actor: HostelPlatformUser,
    where: Prisma.HostelVisitorLogWhereInput,
    query: QueryVisitorLogDto,
  ) {
    const { skip, take, page, limit } = parsePagination(query);
    const [rows, total, canViewId] = await Promise.all([
      this.prisma.hostelVisitorLog.findMany({
        where,
        include: RESIDENT_SELECT,
        orderBy: { in_time: 'desc' },
        skip,
        take,
      }),
      this.prisma.hostelVisitorLog.count({ where }),
      this.canViewId(actor),
    ]);
    return {
      data: rows.map((r) => this.present(r, canViewId)),
      pagination: buildMeta(total, page, limit),
    };
  }

  findAll(actor: HostelPlatformUser, query: QueryVisitorLogDto) {
    return this.page(actor, this.where(actor.institute_id, query), query);
  }

  /** Visitors still inside the hostel. */
  active(actor: HostelPlatformUser, query: QueryVisitorLogDto) {
    return this.page(
      actor,
      this.where(actor.institute_id, { ...query, active: true }),
      query,
    );
  }

  today(actor: HostelPlatformUser, query: QueryVisitorLogDto) {
    const { start, end } = dayRange(localToday());
    return this.page(
      actor,
      {
        ...this.where(actor.institute_id, {
          ...query,
          from: undefined,
          to: undefined,
        }),
        in_time: { gte: start, lt: end },
      },
      query,
    );
  }

  async residentHistory(
    actor: HostelPlatformUser,
    residentId: number,
    query: QueryVisitorLogDto,
  ) {
    await this.lookup.resident(actor.institute_id, residentId);
    return this.page(
      actor,
      this.where(actor.institute_id, { ...query, resident_id: residentId }),
      query,
    );
  }

  async findOne(actor: HostelPlatformUser, id: number) {
    const row = await this.prisma.hostelVisitorLog.findFirst({
      where: { visitor_log_id: id, institute_id: actor.institute_id },
      include: RESIDENT_SELECT,
    });
    if (!row) throw new NotFoundException(`Visitor log #${id} not found`);
    return this.present(row, await this.canViewId(actor));
  }

  /** Conditional update — a visitor can only be checked out once. */
  async checkout(actor: HostelPlatformUser, id: number) {
    const existing = await this.findOne(actor, id);
    const outTime = new Date();
    if (outTime < existing.in_time) {
      throw new BusinessException(
        'INVALID_VISIT_TIME',
        'Checkout cannot be before check-in',
      );
    }
    const claimed = await this.prisma.hostelVisitorLog.updateMany({
      where: {
        visitor_log_id: id,
        institute_id: actor.institute_id,
        out_time: null,
      },
      data: { out_time: outTime, checked_out_by: actor.eddva_user_id },
    });
    if (claimed.count === 0) {
      throw new BusinessException(
        'VISITOR_ALREADY_CHECKED_OUT',
        'This visitor has already been checked out',
        undefined,
        HttpStatus.CONFLICT,
      );
    }
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.VISITOR,
      entityId: String(id),
      action: 'check_out',
      metadata: { out_time: outTime },
    });
    return this.findOne(actor, id);
  }
}
