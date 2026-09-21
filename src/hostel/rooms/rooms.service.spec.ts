/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Prisma } from '@prisma/client';
import { RoomsService } from './rooms.service';
import { BedsService } from './beds.service';

const actor = {
  eddva_user_id: 'w1',
  institute_id: 'inst-1',
  user_name: 'Wanda',
  user_role: 'Warden',
  is_institute_admin: false,
};
const block = { block_id: 1, name: 'Block A', total_floors: 3 };
const room = (over: Record<string, unknown> = {}) => ({
  room_id: 10,
  block_id: 1,
  room_number: 'A-101',
  floor: 1,
  room_type: 'double',
  capacity: 2,
  status: 'available',
  block,
  ...over,
});

describe('RoomsService', () => {
  const db = {
    hostelRoom: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    hostelRoomAllotment: { count: jest.fn() },
    hostelBed: { count: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = { block: jest.fn(), room: jest.fn(), lockRooms: jest.fn() };
  const occupancy = { syncRoomStatus: jest.fn() };
  const audit = { log: jest.fn() };
  const service = new RoomsService(
    db as never,
    lookup as never,
    occupancy as never,
    audit as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) =>
      fn(db),
    );
    lookup.block.mockResolvedValue(block);
    lookup.room.mockResolvedValue(room());
    db.hostelRoom.findFirst.mockResolvedValue(null);
    db.hostelRoom.create.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ room_id: 10, ...data }),
    );
    db.hostelRoom.update.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve(room(data as Record<string, unknown>)),
    );
    db.hostelRoomAllotment.count.mockResolvedValue(0);
    db.hostelBed.count.mockResolvedValue(0);
  });

  const create = (over: Record<string, unknown> = {}) =>
    service.create(actor, {
      block_id: 1,
      room_number: 'A-101',
      floor: 1,
      room_type: 'double',
      capacity: 2,
      ...over,
    } as never);

  it('creates a room in a block', async () => {
    await expect(create()).resolves.toMatchObject({
      room_number: 'A-101',
      capacity: 2,
    });
  });

  it.each([
    ['single', 2],
    ['double', 3],
    ['triple', 2],
    ['dormitory', 1],
  ])(
    'capacity must fit the room type: %s with capacity %i is refused',
    async (room_type, capacity) => {
      await expect(create({ room_type, capacity })).rejects.toMatchObject({
        response: { error: 'ROOM_TYPE_CAPACITY_MISMATCH' },
      });
    },
  );

  it('a dormitory may hold many', async () => {
    await expect(
      create({ room_type: 'dormitory', capacity: 12 }),
    ).resolves.toBeDefined();
  });

  it('duplicate room number in the same block is refused (case-insensitive)', async () => {
    db.hostelRoom.findFirst.mockResolvedValue({ room_id: 99 });
    await expect(create({ room_number: 'a-101' })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('the database unique index is the backstop for a racing duplicate', async () => {
    db.hostelRoom.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '6',
      }),
    );
    await expect(create()).rejects.toMatchObject({ status: 409 });
  });

  it('a floor beyond the block is refused', async () => {
    await expect(create({ floor: 9 })).rejects.toMatchObject({
      response: { error: 'FLOOR_OUT_OF_RANGE' },
    });
  });

  describe('update', () => {
    it('capacity cannot drop below current occupancy (409)', async () => {
      db.hostelRoomAllotment.count.mockResolvedValue(2);
      await expect(
        service.update(actor, 10, { capacity: 1, room_type: 'single' }),
      ).rejects.toMatchObject({
        status: 409,
        response: { error: 'CAPACITY_BELOW_OCCUPANCY' },
      });
    });

    it('capacity cannot drop below the number of beds', async () => {
      lookup.room.mockResolvedValue(
        room({ room_type: 'dormitory', capacity: 4 }),
      );
      db.hostelBed.count.mockResolvedValue(4);
      await expect(
        service.update(actor, 10, { capacity: 3 }),
      ).rejects.toMatchObject({
        response: { error: 'CAPACITY_BELOW_BEDS' },
      });
    });

    it('maintenance restrictions: status is set and then re-derived under a room lock', async () => {
      await service.update(actor, 10, { status: 'under_maintenance' });
      expect(lookup.lockRooms).toHaveBeenCalledWith('inst-1', [10], db);
      expect(db.hostelRoom.update).toHaveBeenCalledWith({
        where: { room_id: 10 },
        data: expect.objectContaining({ status: 'under_maintenance' }),
      });
      expect(occupancy.syncRoomStatus).toHaveBeenCalledWith(10, db);
    });

    it('a room cannot be moved to another block', async () => {
      await expect(
        service.update(actor, 10, { block_id: 2 }),
      ).rejects.toMatchObject({
        response: { error: 'ROOM_BLOCK_IMMUTABLE' },
      });
    });
  });

  describe('remove', () => {
    it('refuses while residents live there', async () => {
      db.hostelRoomAllotment.count.mockResolvedValue(1);
      await expect(service.remove(actor, 10)).rejects.toMatchObject({
        status: 409,
      });
      expect(db.hostelRoom.update).not.toHaveBeenCalled();
    });

    it('soft-deletes the room and its beds (history keeps pointing at the row)', async () => {
      await service.remove(actor, 10);
      expect(db.hostelBed.updateMany).toHaveBeenCalledWith({
        where: { room_id: 10, deleted_at: null },
        data: { deleted_at: expect.any(Date) },
      });
      expect(db.hostelRoom.update).toHaveBeenCalledWith({
        where: { room_id: 10 },
        data: { deleted_at: expect.any(Date) },
      });
    });
  });
});

describe('BedsService', () => {
  const db = {
    hostelBed: {
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    hostelRoomAllotment: { count: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = { room: jest.fn(), bed: jest.fn(), lockRooms: jest.fn() };
  const audit = { log: jest.fn() };
  const service = new BedsService(db as never, lookup as never, audit as never);

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) =>
      fn(db),
    );
    lookup.room.mockResolvedValue(room({ capacity: 2 }));
    db.hostelBed.count.mockResolvedValue(0);
    db.hostelBed.findFirst.mockResolvedValue(null);
    db.hostelRoomAllotment.count.mockResolvedValue(0);
    db.hostelBed.create.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ bed_id: 1, ...data }),
    );
  });

  it('adds a bed under a room lock', async () => {
    await service.create(actor, 10, { bed_number: 'B1' });
    expect(lookup.lockRooms).toHaveBeenCalledWith('inst-1', [10], db);
    expect(db.hostelBed.create).toHaveBeenCalled();
  });

  it('bed count can never exceed room capacity', async () => {
    db.hostelBed.count.mockResolvedValue(2);
    await expect(
      service.create(actor, 10, { bed_number: 'B3' }),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'BED_LIMIT_REACHED' },
    });
  });

  it('bed tracking cannot be switched on while room-level residents have no bed', async () => {
    db.hostelRoomAllotment.count.mockResolvedValue(1);
    await expect(
      service.create(actor, 10, { bed_number: 'B1' }),
    ).rejects.toMatchObject({
      response: { error: 'ROOM_HAS_ROOM_LEVEL_ALLOTMENTS' },
    });
  });

  it('duplicate bed number in a room is refused', async () => {
    db.hostelBed.findFirst.mockResolvedValue({ bed_id: 5 });
    await expect(
      service.create(actor, 10, { bed_number: 'b1' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('an occupied bed cannot be removed', async () => {
    lookup.bed.mockResolvedValue({ bed_id: 1, room_id: 10 });
    db.hostelRoomAllotment.count.mockResolvedValue(1);
    await expect(service.remove(actor, 1)).rejects.toMatchObject({
      status: 409,
    });
    expect(db.hostelBed.update).not.toHaveBeenCalled();
  });
});
