import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAuditService } from '../common/hostel-audit.service';
import { HostelLookupService } from '../common/hostel-lookup.service';
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
  CreateHostelBedDto,
  QueryHostelBedDto,
  UpdateHostelBedDto,
} from './dto/bed.dto';

const SORT_FIELDS = ['bed_number', 'status', 'created_at'] as const;

@Injectable()
export class BedsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: HostelLookupService,
    private readonly audit: HostelAuditService,
  ) {}

  async create(
    actor: HostelPlatformUser,
    roomId: number,
    dto: CreateHostelBedDto,
  ) {
    const room = await this.lookup.room(actor.institute_id, roomId);
    const message = `Bed ${dto.bed_number} already exists in room ${room.room_number}`;
    const bed = await orConflict(message, () =>
      this.prisma.$transaction(async (tx) => {
        await this.lookup.lockRooms(actor.institute_id, [roomId], tx);
        const [beds, bedless, dup] = await Promise.all([
          tx.hostelBed.count({ where: { room_id: roomId, deleted_at: null } }),
          tx.hostelRoomAllotment.count({
            where: { room_id: roomId, status: 'active', bed_id: null },
          }),
          tx.hostelBed.findFirst({
            where: {
              room_id: roomId,
              deleted_at: null,
              bed_number: { equals: dto.bed_number, mode: 'insensitive' },
            },
            select: { bed_id: true },
          }),
        ]);
        if (dup) throw new ConflictException(message);
        if (beds >= room.capacity) {
          throw new BusinessException(
            'BED_LIMIT_REACHED',
            `Room ${room.room_number} has capacity ${room.capacity} and already has ${beds} bed(s)`,
            { capacity: room.capacity, beds },
            409,
          );
        }
        if (bedless > 0) {
          throw new BusinessException(
            'ROOM_HAS_ROOM_LEVEL_ALLOTMENTS',
            `${bedless} resident(s) are allotted to room ${room.room_number} without a bed; re-allot them before enabling bed tracking`,
            { residents_without_bed: bedless },
            409,
          );
        }
        return tx.hostelBed.create({
          data: {
            institute_id: actor.institute_id,
            room_id: roomId,
            bed_number: dto.bed_number,
            created_by: actor.eddva_user_id,
          },
        });
      }),
    );
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.BED,
      entityId: String(bed.bed_id),
      action: 'create',
      metadata: { room_id: roomId, bed_number: bed.bed_number },
    });
    return bed;
  }

  async findAll(instituteId: string, query: QueryHostelBedDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, 'bed_number');
    const where: Prisma.HostelBedWhereInput = {
      institute_id: instituteId,
      deleted_at: null,
      room_id: query.room_id,
      status: query.status,
      room: {
        deleted_at: null,
        ...(query.block_id ? { block_id: query.block_id } : {}),
      },
      ...(query.search
        ? { bed_number: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.hostelBed.findMany({
        where,
        include: {
          room: {
            select: {
              room_id: true,
              room_number: true,
              floor: true,
              block: { select: { block_id: true, name: true } },
            },
          },
          allotments: {
            where: { status: 'active' },
            select: {
              allotment_id: true,
              resident: {
                select: {
                  resident_id: true,
                  student_name: true,
                  admission_no: true,
                },
              },
            },
          },
        },
        orderBy: { [sortBy]: parseSortOrder(query.sortOrder ?? 'asc') },
        skip,
        take,
      }),
      this.prisma.hostelBed.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    await this.lookup.bed(instituteId, id);
    return this.prisma.hostelBed.findFirstOrThrow({
      where: { bed_id: id },
      include: {
        room: {
          include: { block: { select: { block_id: true, name: true } } },
        },
        allotments: {
          where: { status: 'active' },
          include: { resident: true },
        },
      },
    });
  }

  async update(actor: HostelPlatformUser, id: number, dto: UpdateHostelBedDto) {
    const bed = await this.lookup.bed(actor.institute_id, id);
    if (
      dto.bed_number &&
      dto.bed_number.toLowerCase() !== bed.bed_number.toLowerCase()
    ) {
      const dup = await this.prisma.hostelBed.findFirst({
        where: {
          room_id: bed.room_id,
          deleted_at: null,
          bed_id: { not: id },
          bed_number: { equals: dto.bed_number, mode: 'insensitive' },
        },
        select: { bed_id: true },
      });
      if (dup)
        throw new ConflictException(
          `Bed ${dto.bed_number} already exists in this room`,
        );
    }
    const updated = await orConflict(
      `Bed ${dto.bed_number} already exists in this room`,
      () =>
        this.prisma.hostelBed.update({
          where: { bed_id: id },
          data: { bed_number: dto.bed_number },
        }),
    );
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.BED,
      entityId: String(id),
      action: 'update',
      metadata: {
        bed_number: { from: bed.bed_number, to: updated.bed_number },
      },
    });
    return updated;
  }

  /** Soft delete; an occupied bed cannot be removed. */
  async remove(actor: HostelPlatformUser, id: number) {
    const bed = await this.lookup.bed(actor.institute_id, id);
    await this.prisma.$transaction(async (tx) => {
      await this.lookup.lockRooms(actor.institute_id, [bed.room_id], tx);
      const active = await tx.hostelRoomAllotment.count({
        where: { bed_id: id, status: 'active' },
      });
      if (active > 0) {
        throw new ConflictException(
          'Bed is occupied. Vacate or transfer the resident first.',
        );
      }
      await tx.hostelBed.update({
        where: { bed_id: id },
        data: { deleted_at: new Date() },
      });
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.BED,
      entityId: String(id),
      action: 'delete',
    });
    return { deleted: true };
  }

  /** Bed occupancy overall and per block. */
  async occupancy(instituteId: string, blockId?: number) {
    const rows = await this.prisma.hostelBed.groupBy({
      by: ['status'],
      where: {
        institute_id: instituteId,
        deleted_at: null,
        room: { deleted_at: null, ...(blockId ? { block_id: blockId } : {}) },
      },
      _count: { _all: true },
    });
    const n = (s: 'vacant' | 'occupied') =>
      rows.find((r) => r.status === s)?._count._all ?? 0;
    const total = n('vacant') + n('occupied');
    return {
      total,
      occupied: n('occupied'),
      vacant: n('vacant'),
      occupancy_percentage:
        total === 0 ? 0 : Math.round((n('occupied') / total) * 10000) / 100,
    };
  }
}
