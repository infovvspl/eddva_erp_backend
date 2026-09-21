import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HostelMealAttendanceStatus,
  HostelMealType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAuditService } from '../common/hostel-audit.service';
import { HostelLookupService } from '../common/hostel-lookup.service';
import { HOSTEL_ENTITY } from '../common/hostel-entities';
import { BusinessException } from '../common/business-exception';
import { isUniqueViolation, orConflict } from '../common/unique-violation.util';
import { dateOnlyString, localToday, parseDateOnly } from '../common/time.util';
import { buildMeta, parsePagination } from '../common/pagination.util';
import {
  BulkMealAttendanceDto,
  MarkMealAttendanceDto,
  QueryMealAttendanceDto,
  UpdateMealAttendanceDto,
} from './dto/mess.dto';

const MEALS: HostelMealType[] = ['breakfast', 'lunch', 'snacks', 'dinner'];
const STATUSES: HostelMealAttendanceStatus[] = [
  'opted_in',
  'opted_out',
  'consumed',
  'missed',
];

const RESIDENT_SELECT = {
  resident: {
    select: { resident_id: true, student_name: true, admission_no: true },
  },
} satisfies Prisma.HostelMessAttendanceInclude;

@Injectable()
export class MessAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: HostelLookupService,
    private readonly audit: HostelAuditService,
  ) {}

  /**
   * Opting in/out can be done ahead of time; consumed/missed describe something
   * that has happened, so they need today or an earlier date.
   */
  private assertStatusAllowedOn(
    date: Date,
    status: HostelMealAttendanceStatus,
  ) {
    const isOutcome = status === 'consumed' || status === 'missed';
    if (isOutcome && date.getTime() > localToday().getTime()) {
      throw new BusinessException(
        'MEAL_DATE_IN_FUTURE',
        `A meal on ${dateOnlyString(date)} has not happened yet; only opted_in/opted_out can be recorded`,
      );
    }
  }

  private range(query: { date?: string; from?: string; to?: string }) {
    if (query.date) {
      const day = parseDateOnly(query.date, 'date');
      return { gte: day, lte: day };
    }
    const gte = query.from ? parseDateOnly(query.from, 'from') : undefined;
    const lte = query.to ? parseDateOnly(query.to, 'to') : undefined;
    if (gte && lte && gte > lte) {
      throw new BusinessException(
        'INVALID_DATE_RANGE',
        'from must not be after to',
      );
    }
    return gte || lte ? { gte, lte } : undefined;
  }

  async mark(actor: HostelPlatformUser, dto: MarkMealAttendanceDto) {
    const date = dto.meal_date
      ? parseDateOnly(dto.meal_date, 'meal_date')
      : localToday();
    this.assertStatusAllowedOn(date, dto.status);
    const resident = await this.lookup.resident(
      actor.institute_id,
      dto.resident_id,
    );
    if (resident.status !== 'active') {
      throw new BusinessException(
        'RESIDENT_NOT_ACTIVE',
        `Resident is ${resident.status}; meals are tracked for active residents only`,
        { status: resident.status },
      );
    }
    const record = await orConflict(
      `A ${dto.meal_type} record for this resident on ${dateOnlyString(date)} already exists. Use PATCH to change it.`,
      () =>
        this.prisma.hostelMessAttendance.create({
          data: {
            institute_id: actor.institute_id,
            resident_id: dto.resident_id,
            meal_date: date,
            meal_type: dto.meal_type,
            status: dto.status,
            marked_by: actor.eddva_user_id,
          },
          include: RESIDENT_SELECT,
        }),
    );
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.MESS_ATTENDANCE,
      entityId: String(record.mess_attendance_id),
      action: 'mark',
      newStatus: record.status,
      metadata: {
        resident_id: record.resident_id,
        date: dateOnlyString(date),
        meal: record.meal_type,
      },
    });
    return record;
  }

  /** All-or-nothing, like roll call: nothing is saved if any resident is unknown, inactive or already recorded. */
  async bulk(actor: HostelPlatformUser, dto: BulkMealAttendanceDto) {
    const date = dto.meal_date
      ? parseDateOnly(dto.meal_date, 'meal_date')
      : localToday();
    for (const entry of dto.entries)
      this.assertStatusAllowedOn(date, entry.status);

    const ids = dto.entries.map((e) => e.resident_id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (duplicates.length > 0) {
      throw new BusinessException(
        'DUPLICATE_ENTRIES',
        'A resident appears more than once in the request',
        { resident_ids: [...new Set(duplicates)] },
        400,
      );
    }
    const [residents, existing] = await Promise.all([
      this.prisma.hostelResident.findMany({
        where: { institute_id: actor.institute_id, resident_id: { in: ids } },
        select: { resident_id: true, status: true },
      }),
      this.prisma.hostelMessAttendance.findMany({
        where: {
          institute_id: actor.institute_id,
          meal_date: date,
          meal_type: dto.meal_type,
          resident_id: { in: ids },
        },
        select: { resident_id: true },
      }),
    ]);
    const status = new Map(residents.map((r) => [r.resident_id, r.status]));
    const missing = ids.filter((id) => !status.has(id));
    if (missing.length > 0) {
      throw new BusinessException(
        'RESIDENTS_NOT_FOUND',
        `${missing.length} resident(s) not found`,
        { resident_ids: missing },
        404,
      );
    }
    const inactive = ids.filter((id) => status.get(id) !== 'active');
    if (inactive.length > 0) {
      throw new BusinessException(
        'RESIDENT_NOT_ACTIVE',
        `${inactive.length} resident(s) are not active`,
        { resident_ids: inactive },
      );
    }
    if (existing.length > 0) {
      throw new BusinessException(
        'MEAL_ATTENDANCE_ALREADY_MARKED',
        `${existing.length} resident(s) already have a ${dto.meal_type} record on ${dateOnlyString(date)}`,
        { resident_ids: existing.map((e) => e.resident_id) },
        409,
      );
    }
    let created: number;
    try {
      ({ count: created } = await this.prisma.hostelMessAttendance.createMany({
        data: dto.entries.map((e) => ({
          institute_id: actor.institute_id,
          resident_id: e.resident_id,
          meal_date: date,
          meal_type: dto.meal_type,
          status: e.status,
          marked_by: actor.eddva_user_id,
        })),
      }));
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'Some residents were recorded by someone else while you were submitting. Reload and retry.',
        );
      }
      throw err;
    }
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.MESS_ATTENDANCE,
      entityId: `${dateOnlyString(date)}:${dto.meal_type}`,
      action: 'bulk_mark',
      metadata: { created },
    });
    return {
      meal_date: dateOnlyString(date),
      meal_type: dto.meal_type,
      created,
    };
  }

  async update(
    actor: HostelPlatformUser,
    id: number,
    dto: UpdateMealAttendanceDto,
  ) {
    const before = await this.prisma.hostelMessAttendance.findFirst({
      where: { mess_attendance_id: id, institute_id: actor.institute_id },
    });
    if (!before)
      throw new NotFoundException(`Meal attendance #${id} not found`);
    this.assertStatusAllowedOn(before.meal_date, dto.status);
    const updated = await this.prisma.hostelMessAttendance.update({
      where: { mess_attendance_id: id },
      data: { status: dto.status, updated_by: actor.eddva_user_id },
      include: RESIDENT_SELECT,
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.MESS_ATTENDANCE,
      entityId: String(id),
      action: 'update',
      oldStatus: before.status,
      newStatus: updated.status,
    });
    return updated;
  }

  private where(
    instituteId: string,
    query: QueryMealAttendanceDto,
  ): Prisma.HostelMessAttendanceWhereInput {
    const range = this.range(query);
    return {
      institute_id: instituteId,
      meal_type: query.meal_type,
      status: query.status,
      resident_id: query.resident_id,
      ...(range ? { meal_date: range } : {}),
      ...(query.block_id
        ? {
            resident: {
              allotments: {
                some: { status: 'active', room: { block_id: query.block_id } },
              },
            },
          }
        : {}),
      ...(query.search
        ? {
            resident: {
              student_name: { contains: query.search, mode: 'insensitive' },
            },
          }
        : {}),
    };
  }

  async findAll(instituteId: string, query: QueryMealAttendanceDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where = this.where(instituteId, query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.hostelMessAttendance.findMany({
        where,
        include: RESIDENT_SELECT,
        orderBy: [
          { meal_date: 'desc' },
          { meal_type: 'asc' },
          { resident_id: 'asc' },
        ],
        skip,
        take,
      }),
      this.prisma.hostelMessAttendance.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async residentHistory(
    instituteId: string,
    residentId: number,
    query: QueryMealAttendanceDto,
  ) {
    await this.lookup.resident(instituteId, residentId);
    return this.findAll(instituteId, { ...query, resident_id: residentId });
  }

  /**
   * Meal counts per meal type and status. `expected_meals` follows the opt-out
   * model: every active resident is expected unless they opted out.
   */
  async summary(instituteId: string, query: QueryMealAttendanceDto) {
    const where = this.where(instituteId, { ...query, status: undefined });
    const groups = await this.prisma.hostelMessAttendance.groupBy({
      by: ['meal_type', 'status'],
      where,
      _count: { _all: true },
    });
    const n = (meal: HostelMealType, status: HostelMealAttendanceStatus) =>
      groups.find((g) => g.meal_type === meal && g.status === status)?._count
        ._all ?? 0;

    const singleDay = !!query.date || (!!query.from && query.from === query.to);
    const active = singleDay
      ? await this.prisma.hostelResident.count({
          where: { institute_id: instituteId, status: 'active' },
        })
      : undefined;

    const by_meal = MEALS.filter(
      (m) => !query.meal_type || query.meal_type === m,
    ).map((meal) => {
      const counts = Object.fromEntries(
        STATUSES.map((s) => [s, n(meal, s)]),
      ) as Record<HostelMealAttendanceStatus, number>;
      const served = counts.consumed + counts.missed;
      return {
        meal_type: meal,
        ...counts,
        ...(active !== undefined
          ? { expected_meals: Math.max(0, active - counts.opted_out) }
          : {}),
        consumption_rate:
          served === 0
            ? null
            : Math.round((counts.consumed / served) * 10000) / 100,
      };
    });
    const totals = Object.fromEntries(
      STATUSES.map((s) => [s, by_meal.reduce((sum, m) => sum + m[s], 0)]),
    ) as Record<HostelMealAttendanceStatus, number>;
    return { ...totals, by_meal };
  }
}
