import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LeaveApplicationsService } from './leave-applications.service';

describe('LeaveApplicationsService', () => {
  const actor = {
    eddva_user_id: 'u1',
    institute_id: 'INST_1',
    user_name: 'Amy HR',
    user_role: 'HR_OFFICER',
    is_institute_admin: false,
  };

  const staff = { staff_id: 1, institute_id: 'INST_1', status: 'active', staff_type: 'teaching', full_name: 'Aarav' };
  const leaveType = {
    leave_type_id: 10,
    institute_id: 'INST_1',
    name: 'Casual Leave',
    is_active: true,
    applicable_staff_type: null,
  };

  const mockPrisma = {
    staffMember: { findFirst: jest.fn() },
    leaveType: { findFirst: jest.fn() },
    leaveApplication: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    leaveBalance: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
  };
  const mockAudit = { log: jest.fn() };
  const mockNotifications = { notify: jest.fn() };

  let service: LeaveApplicationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((ops: any[]) => Promise.all(ops));
    service = new LeaveApplicationsService(mockPrisma as any, mockAudit as any, mockNotifications as any);
  });

  describe('apply', () => {
    const dto = { staff_id: 1, leave_type_id: 10, from_date: '2026-11-10', to_date: '2026-11-12' };

    beforeEach(() => {
      mockPrisma.staffMember.findFirst.mockResolvedValue(staff);
      mockPrisma.leaveType.findFirst.mockResolvedValue(leaveType);
      mockPrisma.leaveApplication.findFirst.mockResolvedValue(null);
      mockPrisma.leaveBalance.findUnique.mockResolvedValue({ allocated_days: 12, used_days: 0, balance_id: 99 });
      mockPrisma.leaveApplication.create.mockResolvedValue({ application_id: 5, status: 'pending' });
    });

    it('creates a pending application for 3 inclusive days and notifies', async () => {
      const result = await service.apply(actor as any, dto as any);
      expect(mockPrisma.leaveApplication.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ days_count: 3, applied_by: 'u1' }),
      });
      expect(mockNotifications.notify).toHaveBeenCalled();
      expect(result.application_id).toBe(5);
    });

    it('rejects when staff is not active', async () => {
      mockPrisma.staffMember.findFirst.mockResolvedValue({ ...staff, status: 'resigned' });
      await expect(service.apply(actor as any, dto as any)).rejects.toMatchObject({
        response: { error: 'STAFF_NOT_ACTIVE' },
      });
    });

    it('rejects when the leave type does not apply to this staff_type', async () => {
      mockPrisma.leaveType.findFirst.mockResolvedValue({ ...leaveType, applicable_staff_type: 'non_teaching' });
      await expect(service.apply(actor as any, dto as any)).rejects.toMatchObject({
        response: { error: 'LEAVE_TYPE_NOT_APPLICABLE' },
      });
    });

    it('rejects to_date before from_date', async () => {
      await expect(
        service.apply(actor as any, { ...dto, from_date: '2026-11-12', to_date: '2026-11-10' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an overlapping pending/approved application', async () => {
      mockPrisma.leaveApplication.findFirst.mockResolvedValue({ application_id: 3, status: 'approved' });
      await expect(service.apply(actor as any, dto as any)).rejects.toMatchObject({
        response: { error: 'LEAVE_DATES_OVERLAP' },
      });
    });

    it('rejects when no balance has been allocated for this year', async () => {
      mockPrisma.leaveBalance.findUnique.mockResolvedValue(null);
      await expect(service.apply(actor as any, dto as any)).rejects.toMatchObject({
        response: { error: 'NO_LEAVE_BALANCE' },
      });
    });

    it('rejects when the request exceeds the available balance', async () => {
      mockPrisma.leaveBalance.findUnique.mockResolvedValue({ allocated_days: 12, used_days: 11 });
      await expect(service.apply(actor as any, dto as any)).rejects.toMatchObject({
        response: { error: 'LEAVE_BALANCE_EXCEEDED', details: { requested_days: 3, available_days: 1 } },
      });
    });
  });

  describe('approve', () => {
    const application = {
      application_id: 5,
      institute_id: 'INST_1',
      staff_id: 1,
      leave_type_id: 10,
      from_date: new Date('2026-11-10'),
      days_count: 3,
      status: 'pending',
      applied_by: 'applicant-1',
      leave_type: { name: 'Casual Leave' },
    };

    it('approves and increments used_days on the matching balance', async () => {
      mockPrisma.leaveApplication.findFirst.mockResolvedValue(application);
      mockPrisma.leaveBalance.findUnique.mockResolvedValue({ balance_id: 99, allocated_days: 12, used_days: 0 });
      mockPrisma.leaveApplication.update.mockResolvedValue({ ...application, status: 'approved' });
      mockPrisma.leaveBalance.update.mockResolvedValue({});

      await service.approve(actor as any, 5);

      expect(mockPrisma.leaveBalance.update).toHaveBeenCalledWith({
        where: { balance_id: 99 },
        data: { used_days: { increment: 3 } },
      });
      expect(mockNotifications.notify).toHaveBeenCalledWith(expect.anything(), ['applicant-1']);
    });

    it('refuses to approve a non-pending application', async () => {
      mockPrisma.leaveApplication.findFirst.mockResolvedValue({ ...application, status: 'approved' });
      await expect(service.approve(actor as any, 5)).rejects.toMatchObject({
        response: { error: 'LEAVE_APPLICATION_NOT_PENDING' },
      });
    });

    it('refuses to approve past the balance (changed since application)', async () => {
      mockPrisma.leaveApplication.findFirst.mockResolvedValue(application);
      mockPrisma.leaveBalance.findUnique.mockResolvedValue({ balance_id: 99, allocated_days: 12, used_days: 11 });
      await expect(service.approve(actor as any, 5)).rejects.toMatchObject({
        response: { error: 'LEAVE_BALANCE_EXCEEDED' },
      });
    });

    it('404s for an application outside the caller institute', async () => {
      mockPrisma.leaveApplication.findFirst.mockResolvedValue(null);
      await expect(service.approve(actor as any, 999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancel', () => {
    it('cancels a pending application without touching any balance', async () => {
      const application = {
        application_id: 5,
        status: 'pending',
        staff_id: 1,
        leave_type_id: 10,
        from_date: new Date('2026-11-10'),
        days_count: 3,
      };
      mockPrisma.leaveApplication.findFirst.mockResolvedValue(application);
      mockPrisma.leaveApplication.update.mockResolvedValue({ ...application, status: 'cancelled' });

      await service.cancel(actor as any, 5);

      expect(mockPrisma.leaveBalance.update).not.toHaveBeenCalled();
    });

    it('reverses the balance when cancelling an approved, not-yet-started application', async () => {
      const future = new Date();
      future.setUTCDate(future.getUTCDate() + 10);
      const application = {
        application_id: 5,
        status: 'approved',
        staff_id: 1,
        leave_type_id: 10,
        from_date: future,
        days_count: 3,
      };
      mockPrisma.leaveApplication.findFirst.mockResolvedValue(application);
      mockPrisma.leaveBalance.findUnique.mockResolvedValue({ balance_id: 99 });
      mockPrisma.leaveApplication.update.mockResolvedValue({ ...application, status: 'cancelled' });

      await service.cancel(actor as any, 5);

      expect(mockPrisma.leaveBalance.update).toHaveBeenCalledWith({
        where: { balance_id: 99 },
        data: { used_days: { decrement: 3 } },
      });
    });

    it('refuses to cancel an approved application that has already started', async () => {
      const past = new Date();
      past.setUTCDate(past.getUTCDate() - 1);
      const application = {
        application_id: 5,
        status: 'approved',
        staff_id: 1,
        leave_type_id: 10,
        from_date: past,
        days_count: 3,
      };
      mockPrisma.leaveApplication.findFirst.mockResolvedValue(application);

      await expect(service.cancel(actor as any, 5)).rejects.toMatchObject({
        response: { error: 'LEAVE_ALREADY_STARTED' },
      });
    });
  });
});
