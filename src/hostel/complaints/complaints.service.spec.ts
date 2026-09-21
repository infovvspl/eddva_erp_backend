/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { ComplaintsService } from './complaints.service';

const actor = {
  eddva_user_id: 'w1',
  institute_id: 'inst-1',
  user_name: 'Wanda',
  user_role: 'Warden',
  is_institute_admin: false,
};
const complaint = (over: Record<string, unknown> = {}) => ({
  complaint_id: 4,
  institute_id: 'inst-1',
  resident_id: 7,
  room_id: 10,
  category: 'electrical',
  priority: 'medium',
  status: 'open',
  assigned_to: null,
  resolution_notes: null,
  room: { room_number: 'A-101' },
  ...over,
});

describe('ComplaintsService', () => {
  const db = {
    hostelComplaint: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
    hostelComplaintUpdate: { create: jest.fn(), findMany: jest.fn() },
    hostelRoomAllotment: { findFirst: jest.fn() },
    hostelRoom: { findUnique: jest.fn() },
    hostelResident: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = {
    resident: jest.fn(),
    room: jest.fn(),
    complaint: jest.fn(),
    staffMember: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const notifications = { notifyStaff: jest.fn(), notifyGuardian: jest.fn() };
  const service = new ComplaintsService(
    db as never,
    lookup as never,
    audit as never,
    notifications as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) =>
      fn(db),
    );
    lookup.complaint.mockResolvedValue(complaint());
    lookup.resident.mockResolvedValue({ resident_id: 7 });
    lookup.room.mockResolvedValue({ room_id: 10 });
    lookup.staffMember.mockResolvedValue({
      eddva_user_id: 'w2',
      user_name: 'Walt',
    });
    db.hostelComplaint.create.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve(complaint(data as Record<string, unknown>)),
    );
    db.hostelComplaint.update.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve(complaint(data as Record<string, unknown>)),
    );
    db.hostelComplaint.updateMany.mockResolvedValue({ count: 1 });
    db.hostelComplaint.findFirstOrThrow.mockResolvedValue(complaint());
    db.hostelRoomAllotment.findFirst.mockResolvedValue({ room_id: 10 });
    db.hostelRoom.findUnique.mockResolvedValue({
      block: { warden_user_id: 'w1' },
    });
    db.hostelResident.findUnique.mockResolvedValue({
      guardian_phone: '1',
      guardian_email: null,
    });
  });

  describe('create', () => {
    it('needs a resident or a room', async () => {
      await expect(
        service.create(actor, { category: 'plumbing', description: 'leak' }),
      ).rejects.toMatchObject({
        response: { error: 'COMPLAINT_TARGET_REQUIRED' },
      });
    });

    it('defaults the room to the resident’s current room, starts open and writes the first timeline entry', async () => {
      await service.create(actor, {
        resident_id: 7,
        category: 'electrical',
        description: 'fan',
      });
      expect(db.hostelComplaint.create.mock.calls[0][0].data).toMatchObject({
        room_id: 10,
        priority: 'medium',
        resident_id: 7,
      });
      expect(db.hostelComplaintUpdate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ notes: 'Complaint registered' }),
      });
    });

    it('urgent and high complaints alert the block warden', async () => {
      await service.create(actor, {
        resident_id: 7,
        category: 'electrical',
        description: 'sparks',
        priority: 'urgent',
      });
      expect(notifications.notifyStaff).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'complaint_raised' }),
        ['w1'],
      );
    });

    it('a low-priority complaint does not page anyone', async () => {
      await service.create(actor, {
        resident_id: 7,
        category: 'other',
        description: 'x',
        priority: 'low',
      });
      expect(notifications.notifyStaff).not.toHaveBeenCalled();
    });
  });

  describe('assignment', () => {
    it('assigns to an active staff member, records it on the timeline and notifies them', async () => {
      await service.assign(actor, 4, {
        assigned_to: 'w2',
        notes: 'today please',
      });
      expect(db.hostelComplaint.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { assigned_to: 'w2', assigned_to_name: 'Walt' },
        }),
      );
      expect(db.hostelComplaintUpdate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status_change: 'assign',
          notes: 'today please',
        }),
      });
      expect(notifications.notifyStaff).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'complaint_assigned' }),
        ['w2'],
      );
    });

    it('a second assignment is recorded as a reassignment', async () => {
      lookup.complaint.mockResolvedValue(complaint({ assigned_to: 'w1' }));
      await service.assign(actor, 4, { assigned_to: 'w2' });
      expect(db.hostelComplaintUpdate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status_change: 'reassign' }),
      });
    });

    it('resolved and closed complaints cannot be assigned', async () => {
      for (const status of ['resolved', 'closed']) {
        lookup.complaint.mockResolvedValue(complaint({ status }));
        await expect(
          service.assign(actor, 4, { assigned_to: 'w2' }),
        ).rejects.toMatchObject({ status: 409 });
      }
    });
  });

  describe('status workflow', () => {
    it.each([
      ['open', 'in_progress'],
      ['open', 'resolved'],
      ['in_progress', 'resolved'],
      ['resolved', 'closed'],
      ['resolved', 'in_progress'],
    ])('%s → %s is allowed', async (from, to) => {
      lookup.complaint.mockResolvedValue(complaint({ status: from }));
      await expect(
        service.changeStatus(actor, 4, to as never, 'notes'),
      ).resolves.toBeDefined();
    });

    it.each([
      ['in_progress', 'open'],
      ['open', 'open'],
      ['closed', 'open'],
      ['closed', 'in_progress'],
      ['resolved', 'open'],
    ])('%s → %s is rejected (409)', async (from, to) => {
      lookup.complaint.mockResolvedValue(complaint({ status: from }));
      await expect(
        service.changeStatus(actor, 4, to as never, 'x'),
      ).rejects.toMatchObject({
        status: 409,
        response: { error: 'INVALID_STATE_TRANSITION' },
      });
      expect(db.hostelComplaint.updateMany).not.toHaveBeenCalled();
    });

    it('resolving stamps resolved_at and notifies the resident’s guardian', async () => {
      await service.resolve(actor, 4, 'Replaced the capacitor');
      expect(db.hostelComplaint.updateMany.mock.calls[0][0].data).toMatchObject(
        {
          status: 'resolved',
          resolved_at: expect.any(Date),
          resolution_notes: 'Replaced the capacitor',
        },
      );
      expect(notifications.notifyGuardian).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'complaint_resolved' }),
        expect.anything(),
      );
    });

    it('re-opening a resolved complaint clears resolved_at', async () => {
      lookup.complaint.mockResolvedValue(complaint({ status: 'resolved' }));
      await service.changeStatus(actor, 4, 'in_progress', 'not fixed');
      expect(db.hostelComplaint.updateMany.mock.calls[0][0].data).toMatchObject(
        { resolved_at: null },
      );
    });

    it('closing stamps closed_at', async () => {
      lookup.complaint.mockResolvedValue(complaint({ status: 'resolved' }));
      await service.close(actor, 4);
      expect(db.hostelComplaint.updateMany.mock.calls[0][0].data).toMatchObject(
        { status: 'closed', closed_at: expect.any(Date) },
      );
    });

    it('the write is conditional on the status that was validated (two people cannot both win)', async () => {
      await service.changeStatus(actor, 4, 'in_progress', 'go');
      expect(
        db.hostelComplaint.updateMany.mock.calls[0][0].where,
      ).toMatchObject({ complaint_id: 4, status: 'open' });
      db.hostelComplaint.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.changeStatus(actor, 4, 'in_progress', 'go'),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('every status change is written to the update timeline and the audit log', async () => {
      await service.changeStatus(actor, 4, 'in_progress', 'started');
      expect(db.hostelComplaintUpdate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status_change: 'open→in_progress',
          notes: 'started',
          updated_by: 'w1',
        }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          oldStatus: 'open',
          newStatus: 'in_progress',
        }),
      );
    });
  });

  it('a closed complaint can no longer be edited', async () => {
    lookup.complaint.mockResolvedValue(complaint({ status: 'closed' }));
    await expect(
      service.update(actor, 4, { priority: 'low' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('a priority change is recorded on the timeline', async () => {
    await service.update(actor, 4, { priority: 'urgent' });
    expect(db.hostelComplaintUpdate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status_change: 'priority_change' }),
    });
  });
});
