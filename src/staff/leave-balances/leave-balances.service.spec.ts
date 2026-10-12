import { LeaveBalancesService } from './leave-balances.service';

describe('LeaveBalancesService.ensureBalancesForInstitute', () => {
  const mockPrisma = {
    staffMember: { findMany: jest.fn() },
    leaveType: { findMany: jest.fn() },
    leaveBalance: { findMany: jest.fn(), createMany: jest.fn() },
  };
  let service: LeaveBalancesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LeaveBalancesService(mockPrisma as any);
    mockPrisma.leaveBalance.createMany.mockResolvedValue({ count: 0 });
  });

  it('allocates the full annual quota for a staff member with no prior-year balance', async () => {
    mockPrisma.staffMember.findMany.mockResolvedValue([{ staff_id: 1, staff_type: 'teaching' }]);
    mockPrisma.leaveType.findMany.mockResolvedValue([
      { leave_type_id: 10, applicable_staff_type: null, annual_quota_days: 12, allow_carry_forward: false, max_carry_forward_days: null },
    ]);
    mockPrisma.leaveBalance.findMany
      .mockResolvedValueOnce([]) // existing this year
      .mockResolvedValueOnce([]); // previous year

    const count = await service.ensureBalancesForInstitute('INST_1', 2026);

    expect(count).toBe(1);
    expect(mockPrisma.leaveBalance.createMany).toHaveBeenCalledWith({
      data: [{ institute_id: 'INST_1', staff_id: 1, leave_type_id: 10, year: 2026, allocated_days: 12 }],
      skipDuplicates: true,
    });
  });

  it('skips a leave type that does not apply to this staff member\'s staff_type', async () => {
    mockPrisma.staffMember.findMany.mockResolvedValue([{ staff_id: 1, staff_type: 'non_teaching' }]);
    mockPrisma.leaveType.findMany.mockResolvedValue([
      { leave_type_id: 10, applicable_staff_type: 'teaching', annual_quota_days: 12, allow_carry_forward: false, max_carry_forward_days: null },
    ]);
    mockPrisma.leaveBalance.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const count = await service.ensureBalancesForInstitute('INST_1', 2026);

    expect(count).toBe(0);
    expect(mockPrisma.leaveBalance.createMany).not.toHaveBeenCalled();
  });

  it('skips a pair that already has a balance row for this year', async () => {
    mockPrisma.staffMember.findMany.mockResolvedValue([{ staff_id: 1, staff_type: 'teaching' }]);
    mockPrisma.leaveType.findMany.mockResolvedValue([
      { leave_type_id: 10, applicable_staff_type: null, annual_quota_days: 12, allow_carry_forward: false, max_carry_forward_days: null },
    ]);
    mockPrisma.leaveBalance.findMany.mockResolvedValueOnce([{ staff_id: 1, leave_type_id: 10 }]).mockResolvedValueOnce([]);

    const count = await service.ensureBalancesForInstitute('INST_1', 2026);

    expect(count).toBe(0);
    expect(mockPrisma.leaveBalance.createMany).not.toHaveBeenCalled();
  });

  it('carries forward unused days, capped at max_carry_forward_days', async () => {
    mockPrisma.staffMember.findMany.mockResolvedValue([{ staff_id: 1, staff_type: 'teaching' }]);
    mockPrisma.leaveType.findMany.mockResolvedValue([
      { leave_type_id: 10, applicable_staff_type: null, annual_quota_days: 12, allow_carry_forward: true, max_carry_forward_days: 3 },
    ]);
    mockPrisma.leaveBalance.findMany
      .mockResolvedValueOnce([]) // existing this year
      .mockResolvedValueOnce([{ staff_id: 1, leave_type_id: 10, allocated_days: 12, used_days: 2 }]); // prev year: 10 unused, capped to 3

    await service.ensureBalancesForInstitute('INST_1', 2026);

    expect(mockPrisma.leaveBalance.createMany).toHaveBeenCalledWith({
      data: [{ institute_id: 'INST_1', staff_id: 1, leave_type_id: 10, year: 2026, allocated_days: 15 }],
      skipDuplicates: true,
    });
  });

  it('carries forward nothing when the prior balance was fully used', async () => {
    mockPrisma.staffMember.findMany.mockResolvedValue([{ staff_id: 1, staff_type: 'teaching' }]);
    mockPrisma.leaveType.findMany.mockResolvedValue([
      { leave_type_id: 10, applicable_staff_type: null, annual_quota_days: 12, allow_carry_forward: true, max_carry_forward_days: null },
    ]);
    mockPrisma.leaveBalance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ staff_id: 1, leave_type_id: 10, allocated_days: 12, used_days: 12 }]);

    await service.ensureBalancesForInstitute('INST_1', 2026);

    expect(mockPrisma.leaveBalance.createMany).toHaveBeenCalledWith({
      data: [{ institute_id: 'INST_1', staff_id: 1, leave_type_id: 10, year: 2026, allocated_days: 12 }],
      skipDuplicates: true,
    });
  });

  it('returns 0 without querying balances when there is no staff or no leave types', async () => {
    mockPrisma.staffMember.findMany.mockResolvedValue([]);
    mockPrisma.leaveType.findMany.mockResolvedValue([{ leave_type_id: 10 }]);

    const count = await service.ensureBalancesForInstitute('INST_1', 2026);

    expect(count).toBe(0);
    expect(mockPrisma.leaveBalance.findMany).not.toHaveBeenCalled();
  });
});

describe('LeaveBalancesService.ensureBalancesForStaffMember', () => {
  const mockPrisma = {
    leaveType: { findMany: jest.fn() },
    leaveBalance: { createMany: jest.fn() },
  };
  let service: LeaveBalancesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LeaveBalancesService(mockPrisma as any);
  });

  it('allocates balances only for leave types applicable to this staff_type', async () => {
    mockPrisma.leaveType.findMany.mockResolvedValue([
      { leave_type_id: 10, applicable_staff_type: null, annual_quota_days: 12 },
      { leave_type_id: 11, applicable_staff_type: 'non_teaching', annual_quota_days: 8 },
    ]);
    mockPrisma.leaveBalance.createMany.mockResolvedValue({ count: 1 });

    const count = await service.ensureBalancesForStaffMember('INST_1', 5, 'teaching' as any, 2026);

    expect(mockPrisma.leaveBalance.createMany).toHaveBeenCalledWith({
      data: [{ institute_id: 'INST_1', staff_id: 5, leave_type_id: 10, year: 2026, allocated_days: 12 }],
      skipDuplicates: true,
    });
    expect(count).toBe(1);
  });
});
