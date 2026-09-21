/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { AllotmentsService } from './allotments.service';
import { TransferRequestsService } from './transfer-requests.service';

const actor = {
  eddva_user_id: 'w1',
  institute_id: 'inst-1',
  user_name: 'Wanda',
  user_role: 'Warden',
  is_institute_admin: false,
};
const resident = {
  resident_id: 7,
  student_name: 'Aarav',
  gender: 'male',
  status: 'active',
  guardian_phone: '+91 98',
  guardian_email: null,
};
const active = {
  allotment_id: 5,
  resident_id: 7,
  room_id: 10,
  bed_id: null,
  academic_year: '2026-27',
  allotment_date: new Date('2026-06-01'),
  status: 'active',
};

describe('AllotmentsService', () => {
  const db = {
    hostelRoomAllotment: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
    hostelGatePass: { count: jest.fn(), updateMany: jest.fn() },
    hostelTransferRequest: { updateMany: jest.fn() },
    hostelResident: { update: jest.fn() },
    hostelFeeInvoice: { aggregate: jest.fn() },
    hostelRoom: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = {
    resident: jest.fn(),
    lockResident: jest.fn(),
    lockRooms: jest.fn(),
    allotment: jest.fn(),
  };
  const occupancy = { openAllotment: jest.fn(), closeAllotment: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { notifyGuardian: jest.fn() };
  const service = new AllotmentsService(
    db as never,
    lookup as never,
    occupancy as never,
    audit as never,
    notifications as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) =>
      fn(db),
    );
    lookup.resident.mockResolvedValue(resident);
    lookup.lockResident.mockResolvedValue(resident);
    db.hostelRoomAllotment.findFirst.mockResolvedValue(active);
    db.hostelGatePass.count.mockResolvedValue(0);
    db.hostelFeeInvoice.aggregate.mockResolvedValue({
      _sum: { amount_due: null, amount_paid: null },
    });
    db.hostelResident.update.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ ...resident, ...data }),
    );
    occupancy.openAllotment.mockResolvedValue({
      allotment_id: 6,
      room_id: 11,
      bed_id: null,
    });
    db.hostelRoomAllotment.findFirstOrThrow.mockResolvedValue({
      allotment_id: 6,
      room: { room_number: 'A-2', block: { name: 'A' } },
    });
    lookup.allotment.mockResolvedValue(active);
  });

  describe('create', () => {
    it('rejects an academic year that is not consecutive', async () => {
      await expect(
        service.create(actor, 7, { room_id: 10, academic_year: '2026-28' }),
      ).rejects.toMatchObject({ status: 400 });
      expect(occupancy.openAllotment).not.toHaveBeenCalled();
    });

    it('delegates the invariants to the occupancy service under a resident lock, then audits', async () => {
      await service.create(actor, 7, { room_id: 11, academic_year: '2026-27' });
      expect(lookup.lockResident).toHaveBeenCalledWith('inst-1', 7, db);
      expect(occupancy.openAllotment).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          roomId: 11,
          academicYear: '2026-27',
          allottedBy: 'w1',
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({ action: 'allot' }),
      );
      expect(notifications.notifyGuardian).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'room_allotted' }),
        resident,
      );
    });
  });

  describe('vacate', () => {
    it('closes the allotment (kept as history), marks the resident vacated and cancels unused passes/requests', async () => {
      const result = await service.vacate(actor, 7, { reason: 'left' });
      expect(occupancy.closeAllotment).toHaveBeenCalledWith(
        db,
        active,
        expect.objectContaining({
          status: 'vacated',
          closedBy: 'w1',
          reason: 'left',
        }),
      );
      expect(db.hostelGatePass.updateMany).toHaveBeenCalledWith({
        where: { resident_id: 7, status: { in: ['pending', 'approved'] } },
        data: expect.objectContaining({ status: 'cancelled' }),
      });
      expect(db.hostelTransferRequest.updateMany).toHaveBeenCalled();
      expect(db.hostelResident.update).toHaveBeenCalledWith({
        where: { resident_id: 7 },
        data: expect.objectContaining({ status: 'vacated' }),
      });
      expect(result.outstanding_fee_balance).toBe('0.00');
    });

    it('a resident who is still out on a gate pass cannot vacate', async () => {
      db.hostelGatePass.count.mockResolvedValue(1);
      await expect(service.vacate(actor, 7, {})).rejects.toMatchObject({
        status: 409,
        response: { error: 'RESIDENT_OUT' },
      });
      expect(occupancy.closeAllotment).not.toHaveBeenCalled();
    });

    it('an already vacated resident cannot vacate again', async () => {
      lookup.lockResident.mockResolvedValue({ ...resident, status: 'vacated' });
      await expect(service.vacate(actor, 7, {})).rejects.toMatchObject({
        status: 409,
      });
    });

    it('a resident who was never allotted can still be marked vacated', async () => {
      db.hostelRoomAllotment.findFirst.mockResolvedValue(null);
      await service.vacate(actor, 7, {});
      expect(occupancy.closeAllotment).not.toHaveBeenCalled();
      expect(db.hostelResident.update).toHaveBeenCalled();
    });
  });

  describe('transfer preserves history', () => {
    const target = { roomId: 11, date: new Date('2026-09-21'), reason: 'move' };

    it('closes the old stay as TRANSFERRED, then opens a NEW allotment (never overwrites)', async () => {
      const result = await service.transferInTx(db as never, actor, 7, target);
      const closeOrder = occupancy.closeAllotment.mock.invocationCallOrder[0];
      const openOrder = occupancy.openAllotment.mock.invocationCallOrder[0];
      expect(closeOrder).toBeLessThan(openOrder);
      expect(occupancy.closeAllotment).toHaveBeenCalledWith(
        db,
        active,
        expect.objectContaining({
          status: 'transferred',
          vacateDate: target.date,
        }),
      );
      expect(occupancy.openAllotment).toHaveBeenCalledWith(
        db,
        expect.objectContaining({ roomId: 11, academicYear: '2026-27' }), // year carried over from the closed stay
      );
      expect(result.closed.allotment_id).toBe(5);
      expect(result.created.allotment_id).toBe(6);
    });

    it('locks both rooms together (deadlock-free ordering is done by the lookup)', async () => {
      await service.transferInTx(db as never, actor, 7, target);
      expect(lookup.lockRooms).toHaveBeenCalledWith('inst-1', [10, 11], db);
    });

    it('needs an active allotment to move from', async () => {
      db.hostelRoomAllotment.findFirst.mockResolvedValue(null);
      await expect(
        service.transferInTx(db as never, actor, 7, target),
      ).rejects.toMatchObject({
        response: { error: 'NO_ACTIVE_ALLOTMENT' },
      });
    });

    it('refuses a transfer to where the resident already is', async () => {
      await expect(
        service.transferInTx(db as never, actor, 7, { ...target, roomId: 10 }),
      ).rejects.toMatchObject({ response: { error: 'SAME_PLACEMENT' } });
    });

    it('only active residents can be transferred', async () => {
      lookup.lockResident.mockResolvedValue({
        ...resident,
        status: 'suspended',
      });
      await expect(
        service.transferInTx(db as never, actor, 7, target),
      ).rejects.toMatchObject({
        response: { error: 'RESIDENT_NOT_ACTIVE' },
      });
    });

    it('if opening the new place fails the whole transaction is abandoned (error propagates → rollback)', async () => {
      occupancy.openAllotment.mockRejectedValue(new Error('ROOM_FULL'));
      await expect(
        service.transferInTx(db as never, actor, 7, target),
      ).rejects.toThrow('ROOM_FULL');
    });
  });
});

describe('TransferRequestsService', () => {
  const db = {
    hostelTransferRequest: {
      create: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    hostelRoomAllotment: { findFirst: jest.fn() },
    hostelBlock: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = {
    room: jest.fn(),
    lockResident: jest.fn(),
    resident: jest.fn(),
  };
  const allotments = {
    transferInTx: jest.fn(),
    auditTransfer: jest.fn(),
    notifyTransfer: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const notifications = { notifyStaff: jest.fn(), notifyGuardian: jest.fn() };
  const service = new TransferRequestsService(
    db as never,
    lookup as never,
    allotments as never,
    audit as never,
    notifications as never,
  );
  const request = {
    transfer_id: 3,
    institute_id: 'inst-1',
    resident_id: 7,
    current_allotment_id: 5,
    current_room_id: 10,
    requested_room_id: 11,
    requested_bed_id: null,
    reason: 'Roommate conflict',
    status: 'pending',
    resident: { student_name: 'Aarav' },
    current_room: { room_number: 'A-1', block_id: 1 },
    requested_room: { room_number: 'A-2', block_id: 1 },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) =>
      fn(db),
    );
    db.hostelTransferRequest.findFirst.mockResolvedValue(request);
    db.hostelTransferRequest.updateMany.mockResolvedValue({ count: 1 });
    lookup.room.mockResolvedValue({ room_id: 11 });
    lookup.lockResident.mockResolvedValue({ resident_id: 7, status: 'active' });
    lookup.resident.mockResolvedValue({ resident_id: 7 });
    db.hostelRoomAllotment.findFirst.mockResolvedValue({
      allotment_id: 5,
      room_id: 10,
    });
    db.hostelTransferRequest.count.mockResolvedValue(0);
    db.hostelTransferRequest.create.mockResolvedValue(request);
    db.hostelBlock.findMany.mockResolvedValue([{ warden_user_id: 'w1' }]);
    allotments.transferInTx.mockResolvedValue({
      resident: { student_name: 'A' },
      closed: { allotment_id: 5, room_id: 10 },
      created: { allotment_id: 6, room_id: 11 },
    });
  });

  it('only one PENDING request per resident', async () => {
    db.hostelTransferRequest.count.mockResolvedValue(1);
    await expect(
      service.create(actor, 7, { requested_room_id: 11, reason: 'x' }),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'TRANSFER_ALREADY_PENDING' },
    });
  });

  it('needs an active allotment to request a transfer', async () => {
    db.hostelRoomAllotment.findFirst.mockResolvedValue(null);
    await expect(
      service.create(actor, 7, { requested_room_id: 11, reason: 'x' }),
    ).rejects.toMatchObject({ response: { error: 'NO_ACTIVE_ALLOTMENT' } });
  });

  it('a new request notifies the wardens of both blocks', async () => {
    await service.create(actor, 7, { requested_room_id: 11, reason: 'x' });
    expect(notifications.notifyStaff).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'transfer_requested' }),
      ['w1'],
    );
  });

  describe('approve', () => {
    it('claims the request while still pending, moves the resident, links the new allotment — in one transaction', async () => {
      await service.approve(actor, 3, { remarks: 'ok' });
      expect(db.hostelTransferRequest.updateMany).toHaveBeenCalledWith({
        where: { transfer_id: 3, institute_id: 'inst-1', status: 'pending' },
        data: expect.objectContaining({ status: 'approved', decided_by: 'w1' }),
      });
      expect(allotments.transferInTx).toHaveBeenCalledWith(
        db,
        actor,
        7,
        expect.objectContaining({ roomId: 11, transferRequestId: 3 }),
      );
      expect(db.hostelTransferRequest.update).toHaveBeenCalledWith({
        where: { transfer_id: 3 },
        data: { new_allotment_id: 6 },
      });
      expect(audit.log).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({ action: 'approve', newStatus: 'approved' }),
      );
      expect(allotments.auditTransfer).toHaveBeenCalled();
    });

    it('a request that is no longer pending cannot be approved again (409)', async () => {
      db.hostelTransferRequest.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.approve(actor, 3, {})).rejects.toMatchObject({
        status: 409,
      });
      expect(allotments.transferInTx).not.toHaveBeenCalled();
    });

    it('a stale request (resident moved since) is refused and rolled back', async () => {
      allotments.transferInTx.mockResolvedValue({
        resident: {},
        closed: { allotment_id: 99, room_id: 10 },
        created: { allotment_id: 6, room_id: 11 },
      });
      await expect(service.approve(actor, 3, {})).rejects.toMatchObject({
        status: 409,
        response: { error: 'TRANSFER_REQUEST_STALE' },
      });
    });

    it('a failed move (full room, taken bed) propagates so the claim is rolled back', async () => {
      allotments.transferInTx.mockRejectedValue(new Error('ROOM_FULL'));
      await expect(service.approve(actor, 3, {})).rejects.toThrow('ROOM_FULL');
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  it('reject and cancel only act on pending requests', async () => {
    db.hostelTransferRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.reject(actor, 3, { remarks: 'no' }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(service.cancel(actor, 3)).rejects.toMatchObject({
      status: 409,
    });
  });
});
