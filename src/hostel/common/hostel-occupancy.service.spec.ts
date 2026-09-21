/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { HostelOccupancyService } from './hostel-occupancy.service';

const resident = {
  resident_id: 1,
  gender: 'male' as const,
  status: 'active' as const,
};

const room = (over: Record<string, unknown> = {}) => ({
  room_id: 10,
  room_number: 'A-101',
  capacity: 2,
  status: 'available',
  block: { name: 'Block A', gender_type: 'boys', is_active: true },
  ...over,
});

describe('HostelOccupancyService', () => {
  const tx = {
    hostelRoom: { findUnique: jest.fn(), update: jest.fn() },
    hostelRoomAllotment: {
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    hostelBed: {
      count: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const lookup = { lockRooms: jest.fn(), room: jest.fn() };
  const service = new HostelOccupancyService(lookup as never);
  const open = (over: Record<string, unknown> = {}) =>
    service.openAllotment(tx as never, {
      instituteId: 'i1',
      resident,
      roomId: 10,
      academicYear: '2026-27',
      allotmentDate: new Date('2026-09-21'),
      allottedBy: 'w1',
      ...over,
    });

  beforeEach(() => {
    jest.resetAllMocks();
    lookup.room.mockResolvedValue(room());
    tx.hostelRoomAllotment.findFirst.mockResolvedValue(null);
    tx.hostelRoomAllotment.count.mockResolvedValue(0);
    tx.hostelBed.count.mockResolvedValue(0);
    tx.hostelRoomAllotment.create.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({ allotment_id: 5, ...data }),
    );
    tx.hostelRoom.findUnique.mockResolvedValue(room());
  });

  it('allots at room level when the room has no beds, and locks the room first', async () => {
    const allotment = await open();
    expect(lookup.lockRooms).toHaveBeenCalledWith('i1', [10], tx);
    expect(allotment).toMatchObject({
      room_id: 10,
      bed_id: null,
      status: 'active',
      allotted_by: 'w1',
    });
  });

  it('rejects a resident who is not active', async () => {
    await expect(
      service.openAllotment(tx as never, {
        instituteId: 'i1',
        resident: { ...resident, status: 'suspended' },
        roomId: 10,
        academicYear: '2026-27',
        allotmentDate: new Date(),
        allottedBy: 'w1',
      }),
    ).rejects.toMatchObject({ response: { error: 'RESIDENT_NOT_ACTIVE' } });
  });

  it('refuses a second ACTIVE allotment for the same resident (409)', async () => {
    tx.hostelRoomAllotment.findFirst.mockResolvedValue({ allotment_id: 2 });
    await expect(open()).rejects.toMatchObject({
      status: 409,
      response: { error: 'RESIDENT_ALREADY_ALLOTTED' },
    });
    expect(tx.hostelRoomAllotment.create).not.toHaveBeenCalled();
  });

  it('refuses a room under maintenance', async () => {
    lookup.room.mockResolvedValue(room({ status: 'under_maintenance' }));
    await expect(open()).rejects.toMatchObject({
      response: { error: 'ROOM_UNDER_MAINTENANCE' },
    });
  });

  it('refuses an inactive block', async () => {
    lookup.room.mockResolvedValue(
      room({ block: { name: 'A', gender_type: 'boys', is_active: false } }),
    );
    await expect(open()).rejects.toMatchObject({
      response: { error: 'BLOCK_INACTIVE' },
    });
  });

  it.each([
    ['boys', 'female', false],
    ['girls', 'male', false],
    ['girls', 'other', false],
    ['boys', 'male', true],
    ['girls', 'female', true],
    ['mixed', 'other', true],
    ['mixed', 'female', true],
  ])(
    'gender rule: %s block + %s resident → allowed=%s',
    async (block, gender, allowed) => {
      lookup.room.mockResolvedValue(
        room({ block: { name: 'B', gender_type: block, is_active: true } }),
      );
      const attempt = service.openAllotment(tx as never, {
        instituteId: 'i1',
        resident: { ...resident, gender: gender as 'male' },
        roomId: 10,
        academicYear: '2026-27',
        allotmentDate: new Date(),
        allottedBy: 'w1',
      });
      if (allowed) await expect(attempt).resolves.toBeDefined();
      else
        await expect(attempt).rejects.toMatchObject({
          response: { error: 'GENDER_MISMATCH' },
        });
    },
  );

  it('never exceeds capacity: a full room is refused with 409 ROOM_FULL', async () => {
    tx.hostelRoomAllotment.count.mockResolvedValue(2);
    await expect(open()).rejects.toMatchObject({
      status: 409,
      response: { error: 'ROOM_FULL' },
    });
    expect(tx.hostelRoomAllotment.create).not.toHaveBeenCalled();
  });

  describe('bed-level tracking (optional)', () => {
    beforeEach(() => tx.hostelBed.count.mockResolvedValue(3));

    it('requires a bed when the room tracks beds', async () => {
      await expect(open()).rejects.toMatchObject({
        response: { error: 'BED_REQUIRED' },
      });
    });

    it('rejects a bed that belongs to another room', async () => {
      tx.hostelBed.findFirst.mockResolvedValue(null);
      await expect(open({ bedId: 99 })).rejects.toMatchObject({
        response: { error: 'BED_NOT_IN_ROOM' },
      });
    });

    it('claims a vacant bed atomically and stores it on the allotment', async () => {
      tx.hostelBed.findFirst.mockResolvedValue({ bed_id: 7, bed_number: 'B1' });
      tx.hostelBed.updateMany.mockResolvedValue({ count: 1 });
      const allotment = await open({ bedId: 7 });
      expect(tx.hostelBed.updateMany).toHaveBeenCalledWith({
        where: { bed_id: 7, status: 'vacant' },
        data: { status: 'occupied' },
      });
      expect(allotment.bed_id).toBe(7);
    });

    it('an occupied bed is refused with 409 (the claim matched no vacant row)', async () => {
      tx.hostelBed.findFirst.mockResolvedValue({ bed_id: 7, bed_number: 'B1' });
      tx.hostelBed.updateMany.mockResolvedValue({ count: 0 });
      await expect(open({ bedId: 7 })).rejects.toMatchObject({
        status: 409,
        response: { error: 'BED_OCCUPIED' },
      });
      expect(tx.hostelRoomAllotment.create).not.toHaveBeenCalled();
    });
  });

  it('a bed given for a room without beds is refused', async () => {
    await expect(open({ bedId: 7 })).rejects.toMatchObject({
      response: { error: 'BED_NOT_IN_ROOM' },
    });
  });

  it('marks the room full after the last place is taken', async () => {
    tx.hostelRoomAllotment.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    await open();
    expect(tx.hostelRoom.update).toHaveBeenCalledWith({
      where: { room_id: 10 },
      data: { status: 'full' },
    });
  });

  describe('closeAllotment (history is kept, never deleted)', () => {
    const active = {
      allotment_id: 5,
      room_id: 10,
      bed_id: 7,
      allotment_date: new Date('2026-06-01'),
    };

    it('closes the row as transferred/vacated, frees the bed and refreshes the room status', async () => {
      tx.hostelRoomAllotment.updateMany.mockResolvedValue({ count: 1 });
      tx.hostelRoomAllotment.count.mockResolvedValue(0);
      tx.hostelRoom.findUnique.mockResolvedValue(room({ status: 'full' }));
      await service.closeAllotment(tx as never, active, {
        status: 'transferred',
        vacateDate: new Date('2026-09-21'),
        closedBy: 'w1',
        reason: 'moved',
      });
      expect(tx.hostelRoomAllotment.updateMany).toHaveBeenCalledWith({
        where: { allotment_id: 5, status: 'active' },
        data: expect.objectContaining({
          status: 'transferred',
          closed_by: 'w1',
        }),
      });
      expect(tx.hostelBed.updateMany).toHaveBeenCalledWith({
        where: { bed_id: 7 },
        data: { status: 'vacant' },
      });
      expect(tx.hostelRoom.update).toHaveBeenCalledWith({
        where: { room_id: 10 },
        data: { status: 'available' },
      });
    });

    it('a stay that is already closed cannot be closed again (409)', async () => {
      tx.hostelRoomAllotment.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.closeAllotment(tx as never, active, {
          status: 'vacated',
          vacateDate: new Date('2026-09-21'),
          closedBy: 'w1',
        }),
      ).rejects.toMatchObject({
        status: 409,
        response: { error: 'ALLOTMENT_NOT_ACTIVE' },
      });
      expect(tx.hostelBed.updateMany).not.toHaveBeenCalled();
    });

    it('cannot vacate before the allotment date', async () => {
      await expect(
        service.closeAllotment(tx as never, active, {
          status: 'vacated',
          vacateDate: new Date('2026-05-01'),
          closedBy: 'w1',
        }),
      ).rejects.toMatchObject({
        response: { error: 'VACATE_BEFORE_ALLOTMENT' },
      });
    });
  });

  it('syncRoomStatus never overrides maintenance', async () => {
    tx.hostelRoom.findUnique.mockResolvedValue(
      room({ status: 'under_maintenance' }),
    );
    await service.syncRoomStatus(10, tx as never);
    expect(tx.hostelRoom.update).not.toHaveBeenCalled();
  });
});
