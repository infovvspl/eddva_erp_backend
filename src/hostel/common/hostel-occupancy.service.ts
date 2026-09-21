import { HttpStatus, Injectable } from '@nestjs/common';
import {
  HostelAllotmentStatus,
  HostelGenderType,
  HostelResident,
  Prisma,
} from '@prisma/client';
import { BusinessException } from './business-exception';
import { HostelLookupService } from './hostel-lookup.service';

export interface OpenAllotmentInput {
  instituteId: string;
  resident: Pick<HostelResident, 'resident_id' | 'gender' | 'status'>;
  roomId: number;
  bedId?: number | null;
  academicYear: string;
  allotmentDate: Date;
  allottedBy: string;
}

/**
 * The single place that changes who lives where. Allotment create, vacate and
 * transfer approval all go through here so the invariants hold no matter which
 * entry point is used:
 *  - a resident has at most one ACTIVE allotment (also a partial unique index),
 *  - active allotments in a room never exceed its capacity (room row is locked),
 *  - a bed is held by at most one ACTIVE allotment (also a partial unique index),
 *  - room/bed status columns always mirror the active allotments.
 * Every method must run inside the caller's `$transaction`.
 */
@Injectable()
export class HostelOccupancyService {
  constructor(private readonly lookup: HostelLookupService) {}

  private genderAllowed(
    blockType: HostelGenderType,
    residentGender: HostelResident['gender'],
  ): boolean {
    if (blockType === 'mixed') return true;
    if (blockType === 'boys') return residentGender === 'male';
    return residentGender === 'female';
  }

  /** Keeps `hostel_rooms.status` (available/full) in step with active allotments; maintenance is left alone. */
  async syncRoomStatus(
    roomId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const room = await tx.hostelRoom.findUnique({ where: { room_id: roomId } });
    if (!room || room.status === 'under_maintenance') return;
    const active = await tx.hostelRoomAllotment.count({
      where: { room_id: roomId, status: 'active' },
    });
    const next = active >= room.capacity ? 'full' : 'available';
    if (next !== room.status) {
      await tx.hostelRoom.update({
        where: { room_id: roomId },
        data: { status: next },
      });
    }
  }

  async openAllotment(tx: Prisma.TransactionClient, input: OpenAllotmentInput) {
    const { instituteId, resident, roomId } = input;

    if (resident.status !== 'active') {
      throw new BusinessException(
        'RESIDENT_NOT_ACTIVE',
        `Resident is ${resident.status}; only active residents can be allotted a room`,
        { status: resident.status },
      );
    }

    // Serialise everyone competing for this room, then read fresh state.
    await this.lookup.lockRooms(instituteId, [roomId], tx);

    const existing = await tx.hostelRoomAllotment.findFirst({
      where: { resident_id: resident.resident_id, status: 'active' },
      select: { allotment_id: true },
    });
    if (existing) {
      throw new BusinessException(
        'RESIDENT_ALREADY_ALLOTTED',
        'Resident already has an active room allotment. Vacate or transfer first.',
        { allotment_id: existing.allotment_id },
        HttpStatus.CONFLICT,
      );
    }

    const room = await this.lookup.room(instituteId, roomId, tx);
    if (room.status === 'under_maintenance') {
      throw new BusinessException(
        'ROOM_UNDER_MAINTENANCE',
        `Room ${room.room_number} is under maintenance and cannot be allotted`,
      );
    }
    if (!room.block.is_active) {
      throw new BusinessException(
        'BLOCK_INACTIVE',
        `Block ${room.block.name} is inactive`,
      );
    }
    if (!this.genderAllowed(room.block.gender_type, resident.gender)) {
      throw new BusinessException(
        'GENDER_MISMATCH',
        `Block ${room.block.name} is a ${room.block.gender_type} block and cannot house a ${resident.gender} resident`,
        {
          block_gender: room.block.gender_type,
          resident_gender: resident.gender,
        },
      );
    }

    const activeInRoom = await tx.hostelRoomAllotment.count({
      where: { room_id: roomId, status: 'active' },
    });
    if (activeInRoom >= room.capacity) {
      throw new BusinessException(
        'ROOM_FULL',
        `Room ${room.room_number} is full (${activeInRoom}/${room.capacity})`,
        { capacity: room.capacity, occupied: activeInRoom },
        HttpStatus.CONFLICT,
      );
    }

    // Bed-level tracking is optional: a room without bed rows is allotted at room level.
    const bedCount = await tx.hostelBed.count({
      where: { room_id: roomId, deleted_at: null },
    });
    let bedId: number | null = null;
    if (bedCount > 0) {
      if (!input.bedId) {
        throw new BusinessException(
          'BED_REQUIRED',
          `Room ${room.room_number} has bed-level tracking; choose a vacant bed`,
        );
      }
      const bed = await tx.hostelBed.findFirst({
        where: {
          bed_id: input.bedId,
          room_id: roomId,
          institute_id: instituteId,
          deleted_at: null,
        },
      });
      if (!bed) {
        throw new BusinessException(
          'BED_NOT_IN_ROOM',
          `Bed #${input.bedId} does not belong to room ${room.room_number}`,
        );
      }
      // Conditional flip = atomic claim of the bed.
      const claimed = await tx.hostelBed.updateMany({
        where: { bed_id: bed.bed_id, status: 'vacant' },
        data: { status: 'occupied' },
      });
      if (claimed.count === 0) {
        throw new BusinessException(
          'BED_OCCUPIED',
          `Bed ${bed.bed_number} is already occupied`,
          { bed_id: bed.bed_id },
          HttpStatus.CONFLICT,
        );
      }
      bedId = bed.bed_id;
    } else if (input.bedId) {
      throw new BusinessException(
        'BED_NOT_IN_ROOM',
        `Room ${room.room_number} has no beds configured; allot at room level`,
      );
    }

    const allotment = await tx.hostelRoomAllotment.create({
      data: {
        institute_id: instituteId,
        resident_id: resident.resident_id,
        room_id: roomId,
        bed_id: bedId,
        academic_year: input.academicYear,
        allotment_date: input.allotmentDate,
        status: 'active',
        allotted_by: input.allottedBy,
      },
    });
    await this.syncRoomStatus(roomId, tx);
    return allotment;
  }

  /**
   * Closes an active allotment (vacated/transferred), frees its bed and
   * refreshes the room status. The row is kept forever as history.
   */
  async closeAllotment(
    tx: Prisma.TransactionClient,
    allotment: {
      allotment_id: number;
      room_id: number;
      bed_id: number | null;
      allotment_date: Date;
    },
    close: {
      status: Extract<HostelAllotmentStatus, 'vacated' | 'transferred'>;
      vacateDate: Date;
      closedBy: string;
      reason?: string;
    },
  ): Promise<void> {
    if (close.vacateDate < allotment.allotment_date) {
      throw new BusinessException(
        'VACATE_BEFORE_ALLOTMENT',
        'Vacate date cannot be before the allotment date',
      );
    }
    const closed = await tx.hostelRoomAllotment.updateMany({
      where: { allotment_id: allotment.allotment_id, status: 'active' },
      data: {
        status: close.status,
        vacate_date: close.vacateDate,
        closed_by: close.closedBy,
        close_reason: close.reason,
      },
    });
    if (closed.count === 0) {
      throw new BusinessException(
        'ALLOTMENT_NOT_ACTIVE',
        'This allotment is no longer active',
        { allotment_id: allotment.allotment_id },
        HttpStatus.CONFLICT,
      );
    }
    if (allotment.bed_id) {
      await tx.hostelBed.updateMany({
        where: { bed_id: allotment.bed_id },
        data: { status: 'vacant' },
      });
    }
    await this.syncRoomStatus(allotment.room_id, tx);
  }
}
