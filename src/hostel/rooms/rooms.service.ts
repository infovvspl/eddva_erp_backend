import { ConflictException, Injectable } from '@nestjs/common';
import { HostelRoomType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAuditService } from '../common/hostel-audit.service';
import { HostelLookupService } from '../common/hostel-lookup.service';
import { HostelOccupancyService } from '../common/hostel-occupancy.service';
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
  CreateHostelRoomDto,
  QueryHostelRoomDto,
  UpdateHostelRoomDto,
} from './dto/room.dto';

const SORT_FIELDS = ['room_number', 'floor', 'capacity', 'created_at'] as const;

const FIXED_CAPACITY: Partial<Record<HostelRoomType, number>> = {
  single: 1,
  double: 2,
  triple: 3,
};

function assertCapacityMatchesType(type: HostelRoomType, capacity: number) {
  const fixed = FIXED_CAPACITY[type];
  if (fixed !== undefined && capacity !== fixed) {
    throw new BusinessException(
      'ROOM_TYPE_CAPACITY_MISMATCH',
      `A ${type} room must have capacity ${fixed} (got ${capacity})`,
      { room_type: type, capacity },
    );
  }
  if (type === 'dormitory' && capacity < 2) {
    throw new BusinessException(
      'ROOM_TYPE_CAPACITY_MISMATCH',
      'A dormitory must have capacity of at least 2',
      { room_type: type, capacity },
    );
  }
}

const withOccupancy = <
  T extends {
    capacity: number;
    status: string;
    _count: { allotments: number };
  },
>(
  room: T,
) => {
  const { _count, ...rest } = room;
  const occupied = _count.allotments;
  return {
    ...rest,
    occupied,
    vacant:
      room.status === 'under_maintenance'
        ? 0
        : Math.max(0, room.capacity - occupied),
  };
};

const ACTIVE_COUNT = {
  _count: { select: { allotments: { where: { status: 'active' as const } } } },
};

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: HostelLookupService,
    private readonly occupancy: HostelOccupancyService,
    private readonly audit: HostelAuditService,
  ) {}

  private assertFloorInBlock(
    floor: number,
    block: { total_floors: number; name: string },
  ) {
    if (floor > block.total_floors) {
      throw new BusinessException(
        'FLOOR_OUT_OF_RANGE',
        `Block ${block.name} has ${block.total_floors} floor(s); floor ${floor} is out of range`,
        { total_floors: block.total_floors, floor },
      );
    }
  }

  async create(actor: HostelPlatformUser, dto: CreateHostelRoomDto) {
    const block = await this.lookup.block(actor.institute_id, dto.block_id);
    this.assertFloorInBlock(dto.floor, block);
    assertCapacityMatchesType(dto.room_type, dto.capacity);

    const clash = await this.prisma.hostelRoom.findFirst({
      where: {
        block_id: dto.block_id,
        deleted_at: null,
        room_number: { equals: dto.room_number, mode: 'insensitive' },
      },
      select: { room_id: true },
    });
    if (clash) {
      throw new ConflictException(
        `Room ${dto.room_number} already exists in block ${block.name}`,
      );
    }
    const room = await orConflict(
      `Room ${dto.room_number} already exists in block ${block.name}`,
      () =>
        this.prisma.hostelRoom.create({
          data: {
            institute_id: actor.institute_id,
            block_id: dto.block_id,
            room_number: dto.room_number,
            floor: dto.floor,
            room_type: dto.room_type,
            capacity: dto.capacity,
            description: dto.description,
            created_by: actor.eddva_user_id,
          },
        }),
    );
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.ROOM,
      entityId: String(room.room_id),
      action: 'create',
      metadata: {
        block_id: room.block_id,
        room_number: room.room_number,
        capacity: room.capacity,
      },
    });
    return room;
  }

  async findAll(instituteId: string, query: QueryHostelRoomDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, 'room_number');
    const where: Prisma.HostelRoomWhereInput = {
      institute_id: instituteId,
      deleted_at: null,
      block_id: query.block_id,
      floor: query.floor,
      room_type: query.room_type,
      status: query.status,
      ...(query.gender_type
        ? { block: { gender_type: query.gender_type } }
        : {}),
      ...(query.search
        ? { room_number: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.hostelRoom.findMany({
        where,
        include: {
          block: { select: { block_id: true, name: true, gender_type: true } },
          ...ACTIVE_COUNT,
        },
        orderBy: { [sortBy]: parseSortOrder(query.sortOrder ?? 'asc') },
        skip,
        take,
      }),
      this.prisma.hostelRoom.count({ where }),
    ]);
    return {
      data: rows.map(withOccupancy),
      pagination: buildMeta(total, page, limit),
    };
  }

  /**
   * Rooms that can take another resident. `status = available` already means
   * "not full and not under maintenance" (the column is maintained inside every
   * allotment transaction), so this stays a plain indexed, paginated query.
   */
  async vacancy(instituteId: string, query: QueryHostelRoomDto) {
    return this.findAll(instituteId, { ...query, status: 'available' });
  }

  async findOne(instituteId: string, id: number) {
    const room = await this.prisma.hostelRoom.findFirst({
      where: { room_id: id, institute_id: instituteId, deleted_at: null },
      include: {
        block: true,
        beds: {
          where: { deleted_at: null },
          orderBy: { bed_number: 'asc' },
        },
        ...ACTIVE_COUNT,
      },
    });
    if (!room) {
      await this.lookup.room(instituteId, id); // throws the standard 404
      return null;
    }
    return withOccupancy(room);
  }

  async update(
    actor: HostelPlatformUser,
    id: number,
    dto: UpdateHostelRoomDto,
  ) {
    const before = await this.lookup.room(actor.institute_id, id);
    const blockId = dto.block_id ?? before.block_id;
    if (blockId !== before.block_id) {
      throw new BusinessException(
        'ROOM_BLOCK_IMMUTABLE',
        'A room cannot be moved to another block; create a new room instead',
      );
    }
    if (dto.floor !== undefined)
      this.assertFloorInBlock(dto.floor, before.block);

    const roomType = dto.room_type ?? before.room_type;
    const capacity = dto.capacity ?? before.capacity;
    if (dto.room_type !== undefined || dto.capacity !== undefined) {
      assertCapacityMatchesType(roomType, capacity);
    }
    if (
      dto.room_number &&
      dto.room_number.toLowerCase() !== before.room_number.toLowerCase()
    ) {
      const clash = await this.prisma.hostelRoom.findFirst({
        where: {
          block_id: blockId,
          deleted_at: null,
          room_id: { not: id },
          room_number: { equals: dto.room_number, mode: 'insensitive' },
        },
        select: { room_id: true },
      });
      if (clash) {
        throw new ConflictException(
          `Room ${dto.room_number} already exists in block ${before.block.name}`,
        );
      }
    }

    const updated = await orConflict(
      `Room ${dto.room_number} already exists in block ${before.block.name}`,
      () =>
        this.prisma.$transaction(async (tx) => {
          await this.lookup.lockRooms(actor.institute_id, [id], tx);
          if (dto.capacity !== undefined && dto.capacity < before.capacity) {
            const [active, beds] = await Promise.all([
              tx.hostelRoomAllotment.count({
                where: { room_id: id, status: 'active' },
              }),
              tx.hostelBed.count({ where: { room_id: id, deleted_at: null } }),
            ]);
            if (dto.capacity < active) {
              throw new BusinessException(
                'CAPACITY_BELOW_OCCUPANCY',
                `Cannot reduce capacity to ${dto.capacity}: ${active} resident(s) currently live here`,
                { occupied: active },
                409,
              );
            }
            if (dto.capacity < beds) {
              throw new BusinessException(
                'CAPACITY_BELOW_BEDS',
                `Cannot reduce capacity to ${dto.capacity}: the room has ${beds} bed(s). Remove beds first`,
                { beds },
                409,
              );
            }
          }
          const room = await tx.hostelRoom.update({
            where: { room_id: id },
            data: {
              room_number: dto.room_number,
              floor: dto.floor,
              room_type: dto.room_type,
              capacity: dto.capacity,
              description: dto.description,
              // 'available' means "clear maintenance"; the real available/full value is re-derived below.
              ...(dto.status ? { status: dto.status } : {}),
            },
          });
          await this.occupancy.syncRoomStatus(id, tx);
          return room;
        }),
    );
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.ROOM,
      entityId: String(id),
      action: dto.status ? `status_${dto.status}` : 'update',
      oldStatus: before.status,
      newStatus: dto.status,
      metadata: { changes: dto },
    });
    return this.findOne(actor.institute_id, updated.room_id);
  }

  /** Soft delete (allotment history keeps pointing at the row). Refused while anyone lives there. */
  async remove(actor: HostelPlatformUser, id: number) {
    await this.lookup.room(actor.institute_id, id);
    await this.prisma.$transaction(async (tx) => {
      await this.lookup.lockRooms(actor.institute_id, [id], tx);
      const active = await tx.hostelRoomAllotment.count({
        where: { room_id: id, status: 'active' },
      });
      if (active > 0) {
        throw new ConflictException(
          `Room still has ${active} resident(s). Vacate or transfer them first.`,
        );
      }
      const now = new Date();
      await tx.hostelBed.updateMany({
        where: { room_id: id, deleted_at: null },
        data: { deleted_at: now },
      });
      await tx.hostelRoom.update({
        where: { room_id: id },
        data: { deleted_at: now },
      });
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.ROOM,
      entityId: String(id),
      action: 'delete',
    });
    return { deleted: true };
  }

  /** Occupancy of one room: capacity, occupied, vacant, and its beds. */
  async occupancyOf(instituteId: string, id: number) {
    const room = await this.findOne(instituteId, id);
    const beds = room!.beds;
    return {
      room_id: room!.room_id,
      room_number: room!.room_number,
      status: room!.status,
      capacity: room!.capacity,
      occupied: room!.occupied,
      vacant: room!.vacant,
      beds: {
        total: beds.length,
        occupied: beds.filter((b) => b.status === 'occupied').length,
        vacant: beds.filter((b) => b.status === 'vacant').length,
      },
    };
  }

  /** Residents currently living in the room. */
  async currentResidents(instituteId: string, id: number) {
    await this.lookup.room(instituteId, id);
    return this.prisma.hostelRoomAllotment.findMany({
      where: { institute_id: instituteId, room_id: id, status: 'active' },
      include: {
        resident: true,
        bed: { select: { bed_id: true, bed_number: true } },
      },
      orderBy: { allotment_date: 'asc' },
    });
  }
}
