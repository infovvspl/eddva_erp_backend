import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface RoomOccupancyRow {
  room_id: number;
  block_id: number;
  room_number: string;
  floor: number;
  room_type: string;
  status: string;
  capacity: number;
  occupied: number;
  vacant: number;
}

export interface OccupancyTotals {
  total_rooms: number;
  rooms_available: number;
  rooms_full: number;
  rooms_under_maintenance: number;
  total_capacity: number;
  occupied: number;
  vacant: number;
  occupancy_percentage: number;
}

/**
 * Read-side occupancy math shared by blocks, rooms, the dashboard and reports.
 * Occupancy is always derived from ACTIVE allotments (the source of truth),
 * never from a stored counter that could drift.
 */
@Injectable()
export class HostelOccupancyStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** One query: rooms with their active-allotment count. `vacant` is 0 for rooms under maintenance. */
  async rooms(
    instituteId: string,
    where: Prisma.HostelRoomWhereInput = {},
  ): Promise<RoomOccupancyRow[]> {
    const rows = await this.prisma.hostelRoom.findMany({
      where: { institute_id: instituteId, deleted_at: null, ...where },
      select: {
        room_id: true,
        block_id: true,
        room_number: true,
        floor: true,
        room_type: true,
        status: true,
        capacity: true,
        _count: {
          select: { allotments: { where: { status: 'active' } } },
        },
      },
      orderBy: [{ block_id: 'asc' }, { floor: 'asc' }, { room_number: 'asc' }],
    });
    return rows.map((r) => {
      const occupied = r._count.allotments;
      return {
        room_id: r.room_id,
        block_id: r.block_id,
        room_number: r.room_number,
        floor: r.floor,
        room_type: r.room_type,
        status: r.status,
        capacity: r.capacity,
        occupied,
        vacant:
          r.status === 'under_maintenance'
            ? 0
            : Math.max(0, r.capacity - occupied),
      };
    });
  }

  totals(rows: RoomOccupancyRow[]): OccupancyTotals {
    const total_capacity = rows.reduce((sum, r) => sum + r.capacity, 0);
    const occupied = rows.reduce((sum, r) => sum + r.occupied, 0);
    return {
      total_rooms: rows.length,
      rooms_available: rows.filter((r) => r.status === 'available').length,
      rooms_full: rows.filter((r) => r.status === 'full').length,
      rooms_under_maintenance: rows.filter(
        (r) => r.status === 'under_maintenance',
      ).length,
      total_capacity,
      occupied,
      vacant: rows.reduce((sum, r) => sum + r.vacant, 0),
      occupancy_percentage:
        total_capacity === 0
          ? 0
          : Math.round((occupied / total_capacity) * 10000) / 100,
    };
  }
}
