import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SalaryStructuresService } from './salary-structures.service';

describe('SalaryStructuresService.create', () => {
  const actor = { eddva_user_id: 'u1', institute_id: 'INST_1', user_name: 'Amy', user_role: 'HR', is_institute_admin: false };

  const mockPrisma = {
    staffMember: { findFirst: jest.fn() },
    staffSalaryStructure: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  };
  const mockAudit = { log: jest.fn() };
  let service: SalaryStructuresService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SalaryStructuresService(mockPrisma as any, mockAudit as any);
    mockPrisma.staffMember.findFirst.mockResolvedValue({ staff_id: 1 });
  });

  it('404s when the staff member does not exist', async () => {
    mockPrisma.staffMember.findFirst.mockResolvedValue(null);
    await expect(
      service.create(actor as any, { staff_id: 99, basic_salary: 30000, effective_from: '2026-11-01' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates the first structure with no prior one to close', async () => {
    mockPrisma.staffSalaryStructure.findFirst.mockResolvedValue(null);
    mockPrisma.staffSalaryStructure.create.mockResolvedValue({ structure_id: 1 });

    await service.create(actor as any, { staff_id: 1, basic_salary: 30000, effective_from: '2026-11-01' });

    expect(mockPrisma.staffSalaryStructure.update).not.toHaveBeenCalled();
    expect(mockPrisma.staffSalaryStructure.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ staff_id: 1, basic_salary: 30000, allowances: {} }),
    });
  });

  it('closes the currently open structure the day before the new one starts', async () => {
    mockPrisma.staffSalaryStructure.findFirst.mockResolvedValue({
      structure_id: 5,
      effective_from: new Date('2026-01-01'),
      effective_to: null,
    });
    mockPrisma.staffSalaryStructure.create.mockResolvedValue({ structure_id: 6 });

    await service.create(actor as any, { staff_id: 1, basic_salary: 35000, effective_from: '2026-11-01' });

    expect(mockPrisma.staffSalaryStructure.update).toHaveBeenCalledWith({
      where: { structure_id: 5 },
      data: { effective_to: new Date('2026-10-31') },
    });
  });

  it('rejects a new structure effective on or before the current one started', async () => {
    mockPrisma.staffSalaryStructure.findFirst.mockResolvedValue({
      structure_id: 5,
      effective_from: new Date('2026-11-01'),
      effective_to: null,
    });

    await expect(
      service.create(actor as any, { staff_id: 1, basic_salary: 35000, effective_from: '2026-10-01' }),
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.staffSalaryStructure.create).not.toHaveBeenCalled();
  });
});

describe('SalaryStructuresService.getCurrent', () => {
  const mockPrisma = { staffMember: {}, staffSalaryStructure: { findFirst: jest.fn() } };
  let service: SalaryStructuresService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SalaryStructuresService(mockPrisma as any, {} as any);
  });

  it('queries for a structure in force as of the given date', async () => {
    mockPrisma.staffSalaryStructure.findFirst.mockResolvedValue({ structure_id: 1 });
    const asOf = new Date('2026-11-30');

    await service.getCurrent('INST_1', 1, asOf);

    expect(mockPrisma.staffSalaryStructure.findFirst).toHaveBeenCalledWith({
      where: {
        institute_id: 'INST_1',
        staff_id: 1,
        effective_from: { lte: asOf },
        OR: [{ effective_to: null }, { effective_to: { gte: asOf } }],
      },
      orderBy: { effective_from: 'desc' },
    });
  });
});
