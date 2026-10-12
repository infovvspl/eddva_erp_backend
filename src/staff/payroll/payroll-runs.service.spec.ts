import { PayrollRunsService } from './payroll-runs.service';

describe('PayrollRunsService.generate', () => {
  const actor = {
    eddva_user_id: 'u1',
    institute_id: 'INST_1',
    user_name: 'Amy HR',
    user_role: 'HR_OFFICER',
    is_institute_admin: false,
  };

  const mockPrisma = {
    payrollRun: { findUnique: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    staffMember: { findMany: jest.fn() },
    staffSalaryStructure: { findMany: jest.fn() },
    leaveApplication: { findMany: jest.fn() },
    payslip: { createMany: jest.fn() },
    $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
  };
  const mockAudit = { log: jest.fn() };
  const mockAutoPosting = { postPayrollDisbursement: jest.fn() };

  let service: PayrollRunsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.payrollRun.create.mockResolvedValue({ run_id: 100, institute_id: 'INST_1', month: 11, year: 2026, status: 'draft' });
    service = new PayrollRunsService(mockPrisma as any, mockAudit as any, mockAutoPosting as any);
  });

  it('refuses to generate a run that already exists for the month', async () => {
    mockPrisma.payrollRun.findUnique.mockResolvedValue({ run_id: 5 });
    await expect(service.generate(actor as any, { month: 11, year: 2026 })).rejects.toMatchObject({
      response: { error: 'PAYROLL_RUN_EXISTS' },
    });
  });

  it('computes gross pay with no leave deduction when no unpaid leave overlaps the month', async () => {
    mockPrisma.payrollRun.findUnique.mockResolvedValue(null);
    mockPrisma.staffMember.findMany.mockResolvedValue([{ staff_id: 1 }]);
    mockPrisma.staffSalaryStructure.findMany.mockResolvedValue([
      { staff_id: 1, basic_salary: 40000, allowances: { hra: 8000, da: 2000 }, effective_from: new Date('2026-01-01'), effective_to: null },
    ]);
    mockPrisma.leaveApplication.findMany.mockResolvedValue([]);

    await service.generate(actor as any, { month: 11, year: 2026 });

    expect(mockPrisma.payslip.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          staff_id: 1,
          basic_salary: 40000,
          allowances_total: 10000,
          gross_salary: 50000,
          lop_days: 0,
          lop_amount: 0,
          net_salary: 50000,
          run_id: 100,
        }),
      ],
    });
  });

  it('deducts the full day count for an unpaid leave entirely inside the month', async () => {
    mockPrisma.payrollRun.findUnique.mockResolvedValue(null);
    mockPrisma.staffMember.findMany.mockResolvedValue([{ staff_id: 1 }]);
    mockPrisma.staffSalaryStructure.findMany.mockResolvedValue([
      { staff_id: 1, basic_salary: 30000, allowances: {}, effective_from: new Date('2026-01-01'), effective_to: null },
    ]);
    // November 2026 has 30 days; per-day rate = 1000. 3-day unpaid leave -> 3000 LOP.
    mockPrisma.leaveApplication.findMany.mockResolvedValue([
      { staff_id: 1, from_date: new Date('2026-11-10'), to_date: new Date('2026-11-12') },
    ]);

    await service.generate(actor as any, { month: 11, year: 2026 });

    expect(mockPrisma.payslip.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ lop_days: 3, lop_amount: 3000, net_salary: 27000 })],
    });
  });

  it('clips LOP days to only the portion of the leave that falls inside the month', async () => {
    mockPrisma.payrollRun.findUnique.mockResolvedValue(null);
    mockPrisma.staffMember.findMany.mockResolvedValue([{ staff_id: 1 }]);
    mockPrisma.staffSalaryStructure.findMany.mockResolvedValue([
      { staff_id: 1, basic_salary: 30000, allowances: {}, effective_from: new Date('2026-01-01'), effective_to: null },
    ]);
    // Leave spans Oct 29 - Nov 2; only Nov 1-2 (2 days) count toward November.
    mockPrisma.leaveApplication.findMany.mockResolvedValue([
      { staff_id: 1, from_date: new Date('2026-10-29'), to_date: new Date('2026-11-02') },
    ]);

    await service.generate(actor as any, { month: 11, year: 2026 });

    expect(mockPrisma.payslip.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ lop_days: 2 })],
    });
  });

  it('skips a staff member with no salary structure in force, without creating their payslip', async () => {
    mockPrisma.payrollRun.findUnique.mockResolvedValue(null);
    mockPrisma.staffMember.findMany.mockResolvedValue([{ staff_id: 1 }, { staff_id: 2 }]);
    mockPrisma.staffSalaryStructure.findMany.mockResolvedValue([
      { staff_id: 1, basic_salary: 30000, allowances: {}, effective_from: new Date('2026-01-01'), effective_to: null },
    ]);
    mockPrisma.leaveApplication.findMany.mockResolvedValue([]);

    const result: any = await service.generate(actor as any, { month: 11, year: 2026 });

    expect(mockPrisma.payslip.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ staff_id: 1 })],
    });
    expect(result.skipped).toEqual([{ staff_id: 2, reason: 'NO_SALARY_STRUCTURE' }]);
  });
});

describe('PayrollRunsService.finalize / markPaid', () => {
  const actor = { eddva_user_id: 'u1', institute_id: 'INST_1', user_name: 'Amy', user_role: 'HR', is_institute_admin: false };

  const mockPrisma = {
    payrollRun: { findFirst: jest.fn(), update: jest.fn() },
  };
  const mockAudit = { log: jest.fn() };
  const mockAutoPosting = { postPayrollDisbursement: jest.fn() };
  let service: PayrollRunsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PayrollRunsService(mockPrisma as any, mockAudit as any, mockAutoPosting as any);
  });

  it('finalizes a draft run', async () => {
    mockPrisma.payrollRun.findFirst.mockResolvedValue({ run_id: 1, status: 'draft', payslips: [] });
    mockPrisma.payrollRun.update.mockResolvedValue({ run_id: 1, status: 'finalized' });

    await service.finalize(actor as any, 1);

    expect(mockPrisma.payrollRun.update).toHaveBeenCalledWith({
      where: { run_id: 1 },
      data: expect.objectContaining({ status: 'finalized' }),
    });
  });

  it('refuses to finalize a run that is not draft', async () => {
    mockPrisma.payrollRun.findFirst.mockResolvedValue({ run_id: 1, status: 'finalized', payslips: [] });
    await expect(service.finalize(actor as any, 1)).rejects.toMatchObject({
      response: { error: 'PAYROLL_RUN_NOT_DRAFT' },
    });
  });

  it('posts each payslip to the ledger when marking a finalized run paid', async () => {
    mockPrisma.payrollRun.findFirst.mockResolvedValue({
      run_id: 1,
      status: 'finalized',
      payslips: [
        { payslip_id: 10, staff_id: 1, net_salary: 27000 },
        { payslip_id: 11, staff_id: 2, net_salary: 50000 },
      ],
    });
    mockPrisma.payrollRun.update.mockResolvedValue({ run_id: 1, status: 'paid' });

    await service.markPaid(actor as any, 1);

    expect(mockAutoPosting.postPayrollDisbursement).toHaveBeenCalledTimes(2);
    expect(mockAutoPosting.postPayrollDisbursement).toHaveBeenCalledWith(
      expect.objectContaining({ payslipId: 10, staffId: 1, netSalary: 27000 }),
    );
  });

  it('refuses to mark paid a run that is not finalized', async () => {
    mockPrisma.payrollRun.findFirst.mockResolvedValue({ run_id: 1, status: 'draft', payslips: [] });
    await expect(service.markPaid(actor as any, 1)).rejects.toMatchObject({
      response: { error: 'PAYROLL_RUN_NOT_FINALIZED' },
    });
  });
});
