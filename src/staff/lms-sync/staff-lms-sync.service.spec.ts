import { StaffLmsSyncService } from './staff-lms-sync.service';

describe('StaffLmsSyncService', () => {
  const mockPrisma = {
    staffMember: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };
  let service: StaffLmsSyncService;
  const OLD_ENV = process.env;

  const teacher = {
    staff_id: 1,
    institute_id: 'INST_1',
    staff_type: 'teaching',
    lms_sync_status: 'pending',
    staff_code: 'STF-1',
    full_name: 'Aarav Mehta',
    email: 'aarav@school.edu',
    phone: '123',
    designation: 'Mathematics Teacher',
    date_of_joining: new Date('2026-06-01'),
    department: { name: 'Mathematics' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, LMS_BASE_URL: 'https://lms.example.com', INTERNAL_API_KEY: 'secret' };
    service = new StaffLmsSyncService(mockPrisma as any);
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('skips when LMS env is not configured', async () => {
    process.env.LMS_BASE_URL = '';
    const result = await service.sync(1);
    expect(result.status).toBe('skipped');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('skips a non-teaching staff member', async () => {
    mockPrisma.staffMember.findUnique.mockResolvedValue({ ...teacher, staff_type: 'non_teaching' });
    const result = await service.sync(1);
    expect(result.status).toBe('skipped');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('skips a teaching staff member with no email', async () => {
    mockPrisma.staffMember.findUnique.mockResolvedValue({ ...teacher, email: null });
    const result = await service.sync(1);
    expect(result.status).toBe('skipped');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('pushes the teacher to the LMS and marks the member synced on success', async () => {
    mockPrisma.staffMember.findUnique.mockResolvedValue(teacher);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ teacherId: 't-1' }) });

    const result = await service.sync(1);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://lms.example.com/internal/erp/teachers',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          instituteId: 'INST_1',
          employeeId: 'STF-1',
          name: 'Aarav Mehta',
          email: 'aarav@school.edu',
          phone: '123',
          department: 'Mathematics',
          designation: 'Mathematics Teacher',
          joiningDate: '2026-06-01',
        }),
      }),
    );
    expect(mockPrisma.staffMember.updateMany).toHaveBeenCalledWith({
      where: { staff_id: 1, lms_sync_status: 'pending' },
      data: expect.objectContaining({ lms_teacher_ref: 't-1', lms_sync_status: 'synced' }),
    });
    expect(result.status).toBe('synced');
  });

  it('records the failure without throwing', async () => {
    mockPrisma.staffMember.findUnique.mockResolvedValue(teacher);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ message: 'TEACHER_CONFLICT' }),
    });

    const result = await service.sync(1);

    expect(result.status).toBe('failed');
    expect(mockPrisma.staffMember.update).toHaveBeenCalledWith({
      where: { staff_id: 1 },
      data: expect.objectContaining({ lms_sync_error: expect.stringContaining('TEACHER_CONFLICT') }),
    });
  });

  describe('pushStatus', () => {
    it('does nothing if the staff member was never synced', async () => {
      mockPrisma.staffMember.findUnique.mockResolvedValue({ ...teacher, lms_sync_status: 'pending' });
      await service.pushStatus(1, 'INACTIVE');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('pushes the status change for a synced teacher', async () => {
      mockPrisma.staffMember.findUnique.mockResolvedValue({ ...teacher, lms_sync_status: 'synced' });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

      await service.pushStatus(1, 'INACTIVE');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://lms.example.com/internal/erp/teachers/status',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ instituteId: 'INST_1', employeeId: 'STF-1', status: 'INACTIVE' }),
        }),
      );
    });

    it('swallows a failed status push without throwing', async () => {
      mockPrisma.staffMember.findUnique.mockResolvedValue({ ...teacher, lms_sync_status: 'synced' });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500, statusText: 'Error', json: async () => ({}) });

      await expect(service.pushStatus(1, 'ACTIVE')).resolves.toBeUndefined();
    });
  });

  describe('pushDepartment', () => {
    it('does nothing if the staff member was never synced', async () => {
      mockPrisma.staffMember.findUnique.mockResolvedValue({ ...teacher, lms_sync_status: 'pending' });
      await service.pushDepartment(1, 'Science');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('pushes the department change for a synced teacher', async () => {
      mockPrisma.staffMember.findUnique.mockResolvedValue({ ...teacher, lms_sync_status: 'synced' });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

      await service.pushDepartment(1, 'Science');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://lms.example.com/internal/erp/teachers/department',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ instituteId: 'INST_1', employeeId: 'STF-1', department: 'Science' }),
        }),
      );
    });

    it('swallows a failed department push without throwing', async () => {
      mockPrisma.staffMember.findUnique.mockResolvedValue({ ...teacher, lms_sync_status: 'synced' });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500, statusText: 'Error', json: async () => ({}) });

      await expect(service.pushDepartment(1, 'Science')).resolves.toBeUndefined();
    });
  });

  describe('listLmsTeachers', () => {
    it('flags which LMS teachers already have a matching ERP staff record', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { teacherId: 't-1', employeeId: 'STF-1', name: 'Aarav', email: 'a@x.com', department: 'Science', isActive: true },
            { teacherId: 't-2', employeeId: 'STF-99', name: 'Priya', email: 'p@x.com', department: null, isActive: true },
          ],
        }),
      });
      mockPrisma.staffMember.findMany.mockResolvedValue([{ staff_id: 5, staff_code: 'STF-1', full_name: 'Aarav' }]);

      const result = await service.listLmsTeachers('INST_1');

      expect(result).toEqual([
        { teacherId: 't-1', employeeId: 'STF-1', name: 'Aarav', email: 'a@x.com', department: 'Science', isActive: true, in_erp: true, erp_staff_id: 5, duplicate_employee_id: false },
        { teacherId: 't-2', employeeId: 'STF-99', name: 'Priya', email: 'p@x.com', department: null, isActive: true, in_erp: false, erp_staff_id: null, duplicate_employee_id: false },
      ]);
    });

    it('throws when LMS env is not configured', async () => {
      process.env.LMS_BASE_URL = '';
      await expect(service.listLmsTeachers('INST_1')).rejects.toThrow('LMS_BASE_URL / INTERNAL_API_KEY not configured');
    });
  });
});
