import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DepartmentsService } from './departments/departments.service';
import { EmployeesService } from './employees/employees.service';
import { VisitorsService } from './visitors/visitors.service';
import { AttachmentsService } from './attachments/attachments.service';
import { DashboardService } from './dashboard/dashboard.service';
import { FrontOfficeAccessService } from './common/front-office-access.service';

const A = 'inst-a';
const B = 'inst-b';
const audit = { log: jest.fn() };

function model() {
  return { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn(), groupBy: jest.fn() };
}
function makePrisma() {
  const prisma: any = {
    frontOfficeDepartment: model(),
    frontOfficeEmployee: model(),
    frontOfficeAvailabilitySlot: model(),
    frontOfficeVisitor: model(),
    frontOfficeVisitorLog: model(),
    frontOfficeEnquiry: model(),
    frontOfficeEnquiryFollowup: model(),
    frontOfficeAppointment: model(),
    frontOfficeComplaint: model(),
    frontOfficeAttachment: model(),
    frontOfficeUserDynamicRole: model(),
    $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  };
  for (const m of Object.values(prisma) as any[]) {
    if (m && typeof m === 'object') {
      m.findFirst?.mockResolvedValue(null);
      m.findMany?.mockResolvedValue([]);
      m.count?.mockResolvedValue(0);
      m.groupBy?.mockResolvedValue([]);
    }
  }
  return prisma;
}

describe('Front Office tenant isolation', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = makePrisma();
    jest.clearAllMocks();
  });

  describe('a missing institute fails closed', () => {
    it.each(['', '   ', undefined, null])('refuses %p instead of running an unfiltered query', async (bad) => {
      const svc = new DepartmentsService(prisma, audit as any);
      await expect(svc.findAll(bad as any)).rejects.toThrow(ForbiddenException);
      expect(prisma.frontOfficeDepartment.findMany).not.toHaveBeenCalled();
    });
  });

  describe('departments and employees', () => {
    it('checks department name clashes and employee email clashes per institute, not globally', async () => {
      prisma.frontOfficeDepartment.create.mockResolvedValue({});
      await new DepartmentsService(prisma, audit as any).create(A, { name: 'Admissions' } as any);
      expect(prisma.frontOfficeDepartment.findFirst).toHaveBeenCalledWith({ where: { name: 'Admissions', institute_id: A } });
      expect(prisma.frontOfficeDepartment.create.mock.calls[0][0].data.institute_id).toBe(A);

      prisma.frontOfficeDepartment.findFirst.mockResolvedValue({ department_id: 1 });
      const svc = new EmployeesService(prisma, audit as any);
      prisma.frontOfficeEmployee.findFirst.mockResolvedValueOnce(null); // email clash check
      prisma.frontOfficeEmployee.create.mockResolvedValue({});
      await svc.create(A, { name: 'Ravi', department_id: 1, email: 'ravi@x.test' } as any);
      expect(prisma.frontOfficeEmployee.findFirst).toHaveBeenCalledWith({ where: { email: 'ravi@x.test', institute_id: A } });
    });

    it('cannot read another institute\'s department or employee', async () => {
      await expect(new DepartmentsService(prisma, audit as any).findOne(B, 1)).rejects.toThrow(NotFoundException);
      await expect(new EmployeesService(prisma, audit as any).findOne(B, 1)).rejects.toThrow(NotFoundException);
    });

    it('will not create an employee in another institute\'s department', async () => {
      const svc = new EmployeesService(prisma, audit as any);
      await expect(svc.create(A, { name: 'Ravi', department_id: 9 } as any)).rejects.toThrow(NotFoundException);
      expect(prisma.frontOfficeDepartment.findFirst).toHaveBeenCalledWith({ where: { department_id: 9, institute_id: A } });
      expect(prisma.frontOfficeEmployee.create).not.toHaveBeenCalled();
    });
  });

  describe('visitors', () => {
    it('checks phone/email duplicates per institute, not globally', async () => {
      const svc = new VisitorsService(prisma, audit as any);
      prisma.frontOfficeVisitor.create.mockResolvedValue({ visitor_id: 1, id_proof_number: null });
      await svc.create(A, { full_name: 'Rahul', phone: '999' } as any, 'u1', false);
      expect(prisma.frontOfficeVisitor.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ institute_id: A }) }));
      expect(prisma.frontOfficeVisitor.create.mock.calls[0][0].data.institute_id).toBe(A);
    });

    it('cannot read or update another institute\'s visitor', async () => {
      const svc = new VisitorsService(prisma, audit as any);
      await expect(svc.findOne(B, 1, false)).rejects.toThrow(NotFoundException);
      await expect(svc.update(B, 1, {} as any, 'u1', false)).rejects.toThrow(NotFoundException);
    });
  });

  describe('attachments', () => {
    it('will not attach a file to another institute\'s visitor/enquiry/complaint', async () => {
      const svc = new AttachmentsService(prisma, audit as any);
      const file = { mimetype: 'image/png', size: 10, originalname: 'a.png', buffer: Buffer.from('x') } as any;
      await expect(svc.upload(A, file, { entity_type: 'visitor', entity_id: 5 } as any)).rejects.toThrow(NotFoundException);
      expect(prisma.frontOfficeVisitor.findFirst).toHaveBeenCalledWith({ where: { visitor_id: 5, institute_id: A } });
      expect(prisma.frontOfficeAttachment.create).not.toHaveBeenCalled();
    });

    it('a download never resolves another institute\'s attachment', async () => {
      const svc = new AttachmentsService(prisma, audit as any);
      await expect(svc.findOne(B, 1)).rejects.toThrow(NotFoundException);
      expect(prisma.frontOfficeAttachment.findFirst).toHaveBeenCalledWith({ where: { attachment_id: 1, institute_id: B } });
    });
  });

  describe('access scope resolution', () => {
    it('looks up the acting employee scoped to their own institute, not by email alone', async () => {
      const svc = new FrontOfficeAccessService(prisma);
      prisma.frontOfficeEmployee.findFirst.mockResolvedValue({ employee_id: 1, department_id: 2 });
      const scope = await svc.resolveScope({
        eddva_user_id: 'u1',
        institute_id: A,
        user_email: 'manager@x.test',
        user_role: 'MANAGER',
        is_institute_admin: false,
      } as any);
      expect(prisma.frontOfficeEmployee.findFirst).toHaveBeenCalledWith({ where: { email: 'manager@x.test', institute_id: A } });
      expect(scope.scope).toBe('department');
    });
  });

  describe('dashboard', () => {
    it('scopes every metric query to the caller\'s institute', async () => {
      await new DashboardService(prisma).getSummary(A);
      expect(prisma.frontOfficeVisitorLog.count.mock.calls[0][0].where.institute_id).toBe(A);
      expect(prisma.frontOfficeEnquiry.count.mock.calls[0][0].where.institute_id).toBe(A);
      expect(prisma.frontOfficeAppointment.count.mock.calls[0][0].where.institute_id).toBe(A);
      expect(prisma.frontOfficeComplaint.count.mock.calls[0][0].where.institute_id).toBe(A);
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('WHERE institute_id = $1'), A, null, null);
    });

    it('refuses a dashboard request with no institute', async () => {
      await expect(new DashboardService(prisma).getSummary('')).rejects.toThrow(ForbiddenException);
      expect(prisma.frontOfficeVisitorLog.count).not.toHaveBeenCalled();
    });
  });
});
