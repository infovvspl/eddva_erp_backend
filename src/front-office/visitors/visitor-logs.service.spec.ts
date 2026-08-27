import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { VisitorLogsService } from './visitor-logs.service';
import { VisitorsService } from './visitors.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FrontOfficeAuditService } from '../common/front-office-audit.service';
import { NumberingService } from '../../numbering/numbering.service';
import { FrontOfficeNotificationService } from '../notifications/front-office-notification.service';

describe('VisitorLogsService', () => {
  let service: VisitorLogsService;

  const mockPrisma = {
    frontOfficeAppointment: { findUnique: jest.fn(), update: jest.fn() },
    frontOfficeVisitor: { findUnique: jest.fn() },
    frontOfficeEmployee: { findUnique: jest.fn() },
    frontOfficeVisitorLog: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  };
  const mockAudit = { log: jest.fn() };
  const mockNumbering = { generateNextNumber: jest.fn().mockResolvedValue('BADGE/2026-27/00001') };
  const mockNotifications = { send: jest.fn() };
  const mockVisitorsService = { findOrCreate: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockNumbering.generateNextNumber.mockResolvedValue('BADGE/2026-27/00001');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitorLogsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FrontOfficeAuditService, useValue: mockAudit },
        { provide: NumberingService, useValue: mockNumbering },
        { provide: FrontOfficeNotificationService, useValue: mockNotifications },
        { provide: VisitorsService, useValue: mockVisitorsService },
      ],
    }).compile();

    service = module.get(VisitorLogsService);
    jest.spyOn(service, 'findOne').mockResolvedValue({ log_id: 1, host_employee: { name: 'Meera' } } as any);
  });

  describe('checkIn', () => {
    it('rejects a duplicate active visit for the same visitor', async () => {
      mockPrisma.frontOfficeVisitor.findUnique.mockResolvedValue({ visitor_id: 2, full_name: 'Rahul' });
      mockPrisma.frontOfficeEmployee.findUnique.mockResolvedValue({ employee_id: 1, name: 'Meera' });
      mockPrisma.frontOfficeVisitorLog.findFirst.mockResolvedValue({ log_id: 42, visitor_id: 2, status: 'checked_in' });

      await expect(service.checkIn({ visitor_id: 2, host_employee_id: 1 } as any)).rejects.toThrow(ConflictException);
      expect(mockPrisma.frontOfficeVisitorLog.create).not.toHaveBeenCalled();
    });

    it('rejects checking in against a cancelled appointment', async () => {
      mockPrisma.frontOfficeAppointment.findUnique.mockResolvedValue({ appointment_id: 1, status: 'cancelled', visitor: null });

      await expect(service.checkIn({ appointment_id: 1 } as any)).rejects.toThrow(ConflictException);
    });

    it('resolves full_name from the appointment when neither visitor_id nor full_name is given', async () => {
      mockPrisma.frontOfficeAppointment.findUnique.mockResolvedValue({
        appointment_id: 1,
        status: 'scheduled',
        visitor: null,
        visitor_id: null,
        visitor_name: 'Kavita Rao',
        phone: '9876500000',
        host_employee_id: 1,
        purpose: 'Meeting',
      });
      mockPrisma.frontOfficeEmployee.findUnique.mockResolvedValue({ employee_id: 1, name: 'Meera' });
      mockVisitorsService.findOrCreate.mockResolvedValue({ visitor_id: 3, full_name: 'Kavita Rao' });
      mockPrisma.frontOfficeVisitorLog.findFirst.mockResolvedValue(null);
      mockPrisma.frontOfficeVisitorLog.create.mockResolvedValue({ log_id: 1, badge_number: 'BADGE/2026-27/00001' });

      await service.checkIn({ appointment_id: 1 } as any);

      expect(mockVisitorsService.findOrCreate).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Kavita Rao' }), undefined);
    });

    it('throws when neither visitor_id, appointment, nor full_name identify the visitor', async () => {
      await expect(service.checkIn({ host_employee_id: 1 } as any)).rejects.toThrow(BadRequestException);
    });

    it('auto-confirms a scheduled appointment on successful check-in', async () => {
      mockPrisma.frontOfficeAppointment.findUnique.mockResolvedValue({
        appointment_id: 1,
        status: 'scheduled',
        visitor: { visitor_id: 3, full_name: 'Kavita Rao' },
        visitor_id: 3,
        host_employee_id: 1,
      });
      mockPrisma.frontOfficeEmployee.findUnique.mockResolvedValue({ employee_id: 1, name: 'Meera' });
      mockPrisma.frontOfficeVisitorLog.findFirst.mockResolvedValue(null);
      mockPrisma.frontOfficeVisitorLog.create.mockResolvedValue({ log_id: 1, badge_number: 'BADGE/2026-27/00001' });

      await service.checkIn({ appointment_id: 1 } as any);

      expect(mockPrisma.frontOfficeAppointment.update).toHaveBeenCalledWith({
        where: { appointment_id: 1 },
        data: { status: 'confirmed' },
      });
    });
  });

  describe('checkOut', () => {
    it('rejects checking out a log that is already checked out', async () => {
      mockPrisma.frontOfficeVisitorLog.findUnique.mockResolvedValue({ log_id: 1, status: 'checked_out' });

      await expect(service.checkOut(1, {}, 'user-1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.frontOfficeVisitorLog.update).not.toHaveBeenCalled();
    });

    it('checks out an active visit and releases the badge implicitly', async () => {
      mockPrisma.frontOfficeVisitorLog.findUnique.mockResolvedValue({ log_id: 1, status: 'checked_in', host_employee_id: 1 });
      mockPrisma.frontOfficeVisitorLog.update.mockResolvedValue({ log_id: 1, status: 'checked_out' });

      const result = await service.checkOut(1, {}, 'user-1');
      expect(result.status).toBe('checked_out');
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'check_out' }));
    });
  });
});
