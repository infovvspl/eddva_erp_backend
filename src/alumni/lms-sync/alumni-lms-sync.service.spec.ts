import { AlumniLmsSyncService } from './alumni-lms-sync.service';

describe('AlumniLmsSyncService', () => {
  const mockPrisma = {
    alumniProfile: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  };
  let service: AlumniLmsSyncService;
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      LMS_BASE_URL: 'https://lms.example.com',
      INTERNAL_API_KEY: 'secret',
    };
    service = new AlumniLmsSyncService(mockPrisma as any);
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('skips when LMS_BASE_URL / INTERNAL_API_KEY are not configured', async () => {
    process.env.LMS_BASE_URL = '';
    const result = await service.sync(1);
    expect(result.status).toBe('skipped');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('skips when the profile has no student_ref', async () => {
    mockPrisma.alumniProfile.findUnique.mockResolvedValue({
      alumni_id: 1,
      student_ref: null,
      lms_sync_status: 'pending',
    });
    const result = await service.sync(1);
    expect(result.status).toBe('skipped');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('skips when the profile is already synced', async () => {
    mockPrisma.alumniProfile.findUnique.mockResolvedValue({
      alumni_id: 1,
      student_ref: 'ENR-1',
      lms_sync_status: 'synced',
    });
    const result = await service.sync(1);
    expect(result.status).toBe('skipped');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('pushes GRADUATED to the LMS and marks the profile synced on success', async () => {
    mockPrisma.alumniProfile.findUnique.mockResolvedValue({
      alumni_id: 1,
      institute_id: 'INST_1',
      student_ref: 'ENR-1',
      lms_sync_status: 'pending',
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const result = await service.sync(1);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://lms.example.com/internal/erp/students/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          instituteId: 'INST_1',
          enrollmentNumber: 'ENR-1',
          status: 'GRADUATED',
        }),
      }),
    );
    expect(mockPrisma.alumniProfile.updateMany).toHaveBeenCalledWith({
      where: { alumni_id: 1, lms_sync_status: 'pending' },
      data: expect.objectContaining({ lms_sync_status: 'synced' }),
    });
    expect(result.status).toBe('synced');
  });

  it('records the failure on the profile without throwing', async () => {
    mockPrisma.alumniProfile.findUnique.mockResolvedValue({
      alumni_id: 1,
      institute_id: 'INST_1',
      student_ref: 'ENR-1',
      lms_sync_status: 'pending',
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ message: 'STUDENT_NOT_FOUND' }),
    });

    const result = await service.sync(1);

    expect(result.status).toBe('failed');
    expect(mockPrisma.alumniProfile.update).toHaveBeenCalledWith({
      where: { alumni_id: 1 },
      data: expect.objectContaining({ lms_sync_error: expect.stringContaining('STUDENT_NOT_FOUND') }),
    });
  });
});
