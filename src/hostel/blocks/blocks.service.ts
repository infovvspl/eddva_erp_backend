import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAuditService } from '../common/hostel-audit.service';
import { HostelLookupService } from '../common/hostel-lookup.service';
import { HostelOccupancyStatsService } from '../common/hostel-occupancy-stats.service';
import { HOSTEL_ENTITY } from '../common/hostel-entities';
import { BusinessException } from '../common/business-exception';
import { orConflict } from '../common/unique-violation.util';
import {
  buildMeta,
  parsePagination,
  parseSort,
  parseSortOrder,
} from '../common/pagination.util';
import {
  CreateHostelBlockDto,
  QueryHostelBlockDto,
  UpdateHostelBlockDto,
} from './dto/block.dto';

const SORT_FIELDS = [
  'name',
  'gender_type',
  'total_floors',
  'created_at',
] as const;

@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: HostelLookupService,
    private readonly stats: HostelOccupancyStatsService,
    private readonly audit: HostelAuditService,
  ) {}

  private async assertNameFree(
    instituteId: string,
    name: string,
    exceptId?: number,
  ) {
    const clash = await this.prisma.hostelBlock.findFirst({
      where: {
        institute_id: instituteId,
        deleted_at: null,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { block_id: { not: exceptId } } : {}),
      },
      select: { block_id: true },
    });
    if (clash) {
      throw new ConflictException(
        `A hostel block named "${name}" already exists`,
      );
    }
  }

  private async resolveWarden(
    instituteId: string,
    wardenUserId?: string | null,
  ) {
    if (!wardenUserId) return { warden_user_id: null, warden_name: null };
    const staff = await this.lookup.staffMember(instituteId, wardenUserId);
    return {
      warden_user_id: staff.eddva_user_id,
      warden_name: staff.user_name,
    };
  }

  async create(actor: HostelPlatformUser, dto: CreateHostelBlockDto) {
    await this.assertNameFree(actor.institute_id, dto.name);
    const warden = await this.resolveWarden(
      actor.institute_id,
      dto.warden_user_id,
    );
    const block = await orConflict(
      `A hostel block named "${dto.name}" already exists`,
      () =>
        this.prisma.hostelBlock.create({
          data: {
            institute_id: actor.institute_id,
            name: dto.name,
            gender_type: dto.gender_type,
            total_floors: dto.total_floors,
            description: dto.description,
            is_active: dto.is_active ?? true,
            created_by: actor.eddva_user_id,
            ...warden,
          },
        }),
    );
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.BLOCK,
      entityId: String(block.block_id),
      action: 'create',
      metadata: { name: block.name, gender_type: block.gender_type },
    });
    return block;
  }

  async findAll(instituteId: string, query: QueryHostelBlockDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, 'name');
    const where: Prisma.HostelBlockWhereInput = {
      institute_id: instituteId,
      deleted_at: null,
      gender_type: query.gender_type,
      is_active: query.is_active,
      warden_user_id: query.warden_user_id,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { warden_name: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.hostelBlock.findMany({
        where,
        include: {
          _count: { select: { rooms: { where: { deleted_at: null } } } },
        },
        orderBy: { [sortBy]: parseSortOrder(query.sortOrder ?? 'asc') },
        skip,
        take,
      }),
      this.prisma.hostelBlock.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  findOne(instituteId: string, id: number) {
    return this.lookup.block(instituteId, id);
  }

  async update(
    actor: HostelPlatformUser,
    id: number,
    dto: UpdateHostelBlockDto,
  ) {
    const existing = await this.lookup.block(actor.institute_id, id);
    if (dto.name && dto.name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertNameFree(actor.institute_id, dto.name, id);
    }
    if (
      dto.total_floors !== undefined &&
      dto.total_floors < existing.total_floors
    ) {
      const highest = await this.prisma.hostelRoom.aggregate({
        where: { block_id: id, deleted_at: null },
        _max: { floor: true },
      });
      const maxFloor = highest._max.floor ?? 0;
      if (dto.total_floors < maxFloor) {
        throw new BusinessException(
          'FLOORS_BELOW_EXISTING_ROOMS',
          `Cannot reduce floors to ${dto.total_floors}: rooms exist on floor ${maxFloor}`,
          { highest_room_floor: maxFloor },
        );
      }
    }
    const warden =
      dto.warden_user_id !== undefined
        ? await this.resolveWarden(actor.institute_id, dto.warden_user_id)
        : {};
    const updated = await orConflict(
      `A hostel block named "${dto.name}" already exists`,
      () =>
        this.prisma.hostelBlock.update({
          where: { block_id: id },
          data: {
            name: dto.name,
            gender_type: dto.gender_type,
            total_floors: dto.total_floors,
            description: dto.description,
            is_active: dto.is_active,
            ...warden,
          },
        }),
    );
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.BLOCK,
      entityId: String(id),
      action: 'update',
      metadata: { changes: dto },
    });
    return updated;
  }

  async assignWarden(
    actor: HostelPlatformUser,
    id: number,
    wardenUserId?: string | null,
  ) {
    const existing = await this.lookup.block(actor.institute_id, id);
    const warden = await this.resolveWarden(actor.institute_id, wardenUserId);
    const updated = await this.prisma.hostelBlock.update({
      where: { block_id: id },
      data: warden,
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.BLOCK,
      entityId: String(id),
      action: 'assign_warden',
      oldStatus: existing.warden_user_id ?? undefined,
      newStatus: warden.warden_user_id ?? undefined,
    });
    return updated;
  }

  /** Soft delete. A block that still has (non-deleted) rooms is history and cannot be deleted. */
  async remove(actor: HostelPlatformUser, id: number) {
    await this.lookup.block(actor.institute_id, id);
    const rooms = await this.prisma.hostelRoom.count({
      where: { block_id: id, deleted_at: null },
    });
    if (rooms > 0) {
      throw new ConflictException(
        `Block still has ${rooms} room(s). Remove them first, or deactivate the block instead.`,
      );
    }
    await this.prisma.hostelBlock.update({
      where: { block_id: id },
      data: { deleted_at: new Date(), is_active: false },
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.BLOCK,
      entityId: String(id),
      action: 'delete',
    });
    return { deleted: true };
  }

  /** Occupancy + available capacity for one block, with a per-floor breakdown. */
  async occupancy(instituteId: string, id: number) {
    const block = await this.lookup.block(instituteId, id);
    const rooms = await this.stats.rooms(instituteId, { block_id: id });
    const beds = await this.prisma.hostelBed.groupBy({
      by: ['status'],
      where: {
        institute_id: instituteId,
        deleted_at: null,
        room: { block_id: id },
      },
      _count: { _all: true },
    });
    const bedCount = (status: 'vacant' | 'occupied') =>
      beds.find((b) => b.status === status)?._count._all ?? 0;

    const floors = new Map<number, typeof rooms>();
    for (const room of rooms) {
      floors.set(room.floor, [...(floors.get(room.floor) ?? []), room]);
    }
    return {
      block: {
        block_id: block.block_id,
        name: block.name,
        gender_type: block.gender_type,
        warden_user_id: block.warden_user_id,
        warden_name: block.warden_name,
      },
      ...this.stats.totals(rooms),
      beds: {
        total: bedCount('vacant') + bedCount('occupied'),
        occupied: bedCount('occupied'),
        vacant: bedCount('vacant'),
      },
      by_floor: [...floors.entries()]
        .sort(([a], [b]) => a - b)
        .map(([floor, floorRooms]) => ({
          floor,
          ...this.stats.totals(floorRooms),
        })),
    };
  }

  /** Current residents of a block (active allotments). */
  async residents(instituteId: string, id: number, query: QueryHostelBlockDto) {
    await this.lookup.block(instituteId, id);
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.HostelRoomAllotmentWhereInput = {
      institute_id: instituteId,
      status: 'active',
      room: { block_id: id },
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
          resident: true,
          room: { select: { room_id: true, room_number: true, floor: true } },
          bed: { select: { bed_id: true, bed_number: true } },
        },
        orderBy: [{ room: { floor: 'asc' } }, { room: { room_number: 'asc' } }],
        skip,
        take,
      }),
      this.prisma.hostelRoomAllotment.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }
}
