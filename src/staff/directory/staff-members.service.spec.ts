import { StaffMembersService } from './staff-members.service';

describe('StaffMembersService.update — LMS department push', () => {
  const actor = { eddva_user_id: 'u1', institute_id: 'INST_1', user_name: 'Amy', user_role: 'HR', is_institute_admin: false };

  const existing = {
    staff_id: 1,
    institute_id: 'INST_1',
    staff_type: 'teaching',
    department_id: 1,
    email: 'teacher@school.edu',
  };

  const mockPrisma = {
    staffMember: { findFirst: jest.fn(), update: jest.fn() },
    staffDepartment: { findFirst: jest.fn() },
  };
  const mockAudit = { log: jest.fn() };
  const mockNumbering = {};
  const mockLeaveBalances = { ensureBalancesForStaffMember: jest.fn() };
  const mockLmsSync = { pushDepartment: jest.fn().mockResolvedValue(undefined), trigger: jest.fn(), pushStatus: jest.fn() };

  let service: StaffMembersService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.staffMember.findFirst.mockResolvedValue(existing);
    mockLmsSync.pushDepartment.mockResolvedValue(undefined);
    service = new StaffMembersService(
      mockPrisma as any,
      mockAudit as any,
      mockNumbering as any,
      mockLeaveBalances as any,
      mockLmsSync as any,
    );
  });

  it('pushes the new department name to the LMS when a teaching staff member moves department', async () => {
    mockPrisma.staffDepartment.findFirst.mockResolvedValue({ department_id: 2, name: 'Science' });
    mockPrisma.staffMember.update.mockResolvedValue({ ...existing, department_id: 2 });

    await service.update(actor as any, 1, { department_id: 2 } as any);

    expect(mockLmsSync.pushDepartment).toHaveBeenCalledWith(1, 'Science');
  });

  it('does not push when the department is unchanged', async () => {
    mockPrisma.staffDepartment.findFirst.mockResolvedValue({ department_id: 1, name: 'Mathematics' });
    mockPrisma.staffMember.update.mockResolvedValue(existing);

    await service.update(actor as any, 1, { department_id: 1 } as any);

    expect(mockLmsSync.pushDepartment).not.toHaveBeenCalled();
  });

  it('does not push for non-teaching staff', async () => {
    mockPrisma.staffMember.findFirst.mockResolvedValue({ ...existing, staff_type: 'non_teaching' });
    mockPrisma.staffDepartment.findFirst.mockResolvedValue({ department_id: 2, name: 'Accounts' });
    mockPrisma.staffMember.update.mockResolvedValue({ ...existing, staff_type: 'non_teaching', department_id: 2 });

    await service.update(actor as any, 1, { department_id: 2 } as any);

    expect(mockLmsSync.pushDepartment).not.toHaveBeenCalled();
  });
});
