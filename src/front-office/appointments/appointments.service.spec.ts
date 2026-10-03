import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FrontOfficeAuditService } from '../common/front-office-audit.service';
import { FrontOfficeNotificationService } from '../notifications/front-office-notification.service';

const INST = 'inst-1';

describe('AppointmentsService', () => {
  let service: AppointmentsService;

  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    frontOfficeAppointment: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockPrisma = {
    $transaction: jest.fn((cb: any) => (typeof cb === 'function' ? cb(tx) : Promise.all(cb))),
    frontOfficeDepartment: { findFirst: jest.fn() },
    frontOfficeEmployee: { findFirst: jest.fn() },
    frontOfficeVisitor: { findFirst: jest.fn() },
    frontOfficeAppointment: {
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockAudit = { log: jest.fn() };
  const mockNotifications = { send: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FrontOfficeAuditService, useValue: mockAudit },
        { provide: FrontOfficeNotificationService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get(AppointmentsService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('refuses a missing institute instead of running an unfiltered query', async () => {
    await expect(
      service.create('', { visitor_name: 'x', host_employee_id: 1, department_id: 1, appointment_date: '2026-09-01', start_time: '09:00', end_time: '09:30' } as any, 'user-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.frontOfficeDepartment.findFirst).not.toHaveBeenCalled();
  });

  describe('create — conflict prevention', () => {
    const dto = {
      visitor_name: 'Kavita Rao',
      host_employee_id: 1,
      department_id: 1,
      appointment_date: '2026-09-01',
      start_time: '09:00',
      end_time: '10:00',
    };

    beforeEach(() => {
      mockPrisma.frontOfficeDepartment.findFirst.mockResolvedValue({ department_id: 1, name: 'Admissions' });
      mockPrisma.frontOfficeEmployee.findFirst.mockResolvedValue({ employee_id: 1, name: 'Meera Nair' });
    });

    it('will not book against another institute\'s department or employee', async () => {
      mockPrisma.frontOfficeDepartment.findFirst.mockResolvedValue(null);
      await expect(service.create(INST, dto as any, 'user-1')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.frontOfficeDepartment.findFirst).toHaveBeenCalledWith({ where: { department_id: 1, institute_id: INST } });
    });

    it('rejects an overlapping slot for the same host', async () => {
      tx.frontOfficeAppointment.findFirst.mockResolvedValue({
        appointment_id: 99,
        start_time: new Date('2026-09-01T09:00:00.000Z'),
        end_time: new Date('2026-09-01T10:00:00.000Z'),
      });

      await expect(service.create(INST, dto as any, 'user-1')).rejects.toThrow(ConflictException);
      expect(tx.frontOfficeAppointment.create).not.toHaveBeenCalled();
    });

    it('allows a back-to-back slot with no overlap', async () => {
      tx.frontOfficeAppointment.findFirst.mockResolvedValue(null);
      tx.frontOfficeAppointment.create.mockResolvedValue({ appointment_id: 1, status: 'scheduled', ...dto });

      const result = await service.create(INST, dto as any, 'user-1');
      expect(result.appointment_id).toBe(1);
      expect(tx.frontOfficeAppointment.create).toHaveBeenCalledTimes(1);
      expect(tx.frontOfficeAppointment.create.mock.calls[0][0].data.institute_id).toBe(INST);
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'create' }));
      expect(mockNotifications.send).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'appointment_created' }));
    });

    it('locks on (host_employee_id, date) via pg_advisory_xact_lock before checking for overlap', async () => {
      tx.frontOfficeAppointment.findFirst.mockResolvedValue(null);
      tx.frontOfficeAppointment.create.mockResolvedValue({ appointment_id: 1 });

      await service.create(INST, dto as any, 'user-1');

      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1::int, $2::int)', 1, 20260901);
    });
  });

  describe('status transitions', () => {
    it('cannot transition another institute\'s appointment', async () => {
      mockPrisma.frontOfficeAppointment.findFirst.mockResolvedValue(null);
      await expect(service.confirm(INST, 1, 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('allows scheduled -> confirmed', async () => {
      mockPrisma.frontOfficeAppointment.findFirst.mockResolvedValue({ appointment_id: 1, status: 'scheduled', host_employee_id: 1 });
      mockPrisma.frontOfficeAppointment.update.mockResolvedValue({ appointment_id: 1, status: 'confirmed' });

      const result = await service.confirm(INST, 1, 'user-1');
      expect(result.status).toBe('confirmed');
    });

    it('rejects completing a still-scheduled appointment (must be confirmed first)', async () => {
      mockPrisma.frontOfficeAppointment.findFirst.mockResolvedValue({ appointment_id: 1, status: 'scheduled', host_employee_id: 1 });

      await expect(service.complete(INST, 1, {}, 'user-1')).rejects.toThrow(ConflictException);
    });

    it('rejects any transition out of a terminal cancelled state', async () => {
      mockPrisma.frontOfficeAppointment.findFirst.mockResolvedValue({ appointment_id: 1, status: 'cancelled', host_employee_id: 1 });

      await expect(service.confirm(INST, 1, 'user-1')).rejects.toThrow(ConflictException);
    });
  });
});
