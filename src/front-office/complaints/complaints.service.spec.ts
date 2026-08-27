import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ComplaintsService } from './complaints.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FrontOfficeAuditService } from '../common/front-office-audit.service';
import { FrontOfficeNotificationService } from '../notifications/front-office-notification.service';

describe('ComplaintsService', () => {
  let service: ComplaintsService;

  const mockPrisma = {
    frontOfficeEmployee: { findUnique: jest.fn() },
    frontOfficeComplaint: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    frontOfficeComplaintUpdate: { create: jest.fn() },
  };
  const mockAudit = { log: jest.fn() };
  const mockNotifications = { send: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.frontOfficeComplaintUpdate.create.mockResolvedValue({ update_id: 1 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplaintsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FrontOfficeAuditService, useValue: mockAudit },
        { provide: FrontOfficeNotificationService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get(ComplaintsService);
  });

  describe('escalate', () => {
    it('raises a low-priority complaint to high and reassigns it to the manager', async () => {
      mockPrisma.frontOfficeComplaint.findUnique.mockResolvedValue({ complaint_id: 1, priority: 'low', assigned_to: 2 });
      mockPrisma.frontOfficeEmployee.findUnique.mockResolvedValue({ employee_id: 5, name: 'Manager Ravi' });
      mockPrisma.frontOfficeComplaint.update.mockResolvedValue({ complaint_id: 1, priority: 'high', assigned_to: 5 });

      const result = await service.escalate(1, { to_employee_id: 5, reason: 'no response' }, 'user-1');

      expect(result.priority).toBe('high');
      expect(mockPrisma.frontOfficeComplaint.update).toHaveBeenCalledWith({
        where: { complaint_id: 1 },
        data: { assigned_to: 5, priority: 'high' },
      });
      expect(mockNotifications.send).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'complaint_escalated', recipientEmployeeId: 5 }));
    });

    it('never lowers priority when escalating an already-critical complaint', async () => {
      mockPrisma.frontOfficeComplaint.findUnique.mockResolvedValue({ complaint_id: 1, priority: 'critical', assigned_to: 2 });
      mockPrisma.frontOfficeEmployee.findUnique.mockResolvedValue({ employee_id: 5, name: 'Manager Ravi' });
      mockPrisma.frontOfficeComplaint.update.mockResolvedValue({ complaint_id: 1, priority: 'critical', assigned_to: 5 });

      await service.escalate(1, { to_employee_id: 5 }, 'user-1');

      expect(mockPrisma.frontOfficeComplaint.update).toHaveBeenCalledWith({
        where: { complaint_id: 1 },
        data: { assigned_to: 5, priority: 'critical' },
      });
    });

    it('always writes a timeline entry for the escalation', async () => {
      mockPrisma.frontOfficeComplaint.findUnique.mockResolvedValue({ complaint_id: 1, priority: 'medium', assigned_to: 2 });
      mockPrisma.frontOfficeEmployee.findUnique.mockResolvedValue({ employee_id: 5, name: 'Manager Ravi' });
      mockPrisma.frontOfficeComplaint.update.mockResolvedValue({ complaint_id: 1 });

      await service.escalate(1, { to_employee_id: 5 }, 'user-1');

      expect(mockPrisma.frontOfficeComplaintUpdate.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ complaint_id: 1, status_change: 'escalated' }) }),
      );
    });
  });

  describe('status workflow', () => {
    it('allows open -> resolved directly and stamps resolved_at', async () => {
      mockPrisma.frontOfficeComplaint.findUnique.mockResolvedValue({ complaint_id: 1, status: 'open', resolved_at: null });
      mockPrisma.frontOfficeComplaint.update.mockImplementation(({ data }: any) => Promise.resolve({ complaint_id: 1, ...data }));

      const result = await service.changeStatus(1, { status: 'resolved' as any }, 'user-1');
      expect(result.status).toBe('resolved');
      expect(result.resolved_at).toBeInstanceOf(Date);
    });

    it('rejects transitioning a closed complaint straight to resolved (must reopen first)', async () => {
      mockPrisma.frontOfficeComplaint.findUnique.mockResolvedValue({ complaint_id: 1, status: 'closed' });

      await expect(service.changeStatus(1, { status: 'resolved' as any }, 'user-1')).rejects.toThrow(ConflictException);
    });

    it('supports reopening a closed complaint', async () => {
      mockPrisma.frontOfficeComplaint.findUnique.mockResolvedValue({ complaint_id: 1, status: 'closed' });
      mockPrisma.frontOfficeComplaint.update.mockResolvedValue({ complaint_id: 1, status: 'open' });

      const result = await service.changeStatus(1, { status: 'open' as any }, 'user-1');
      expect(result.status).toBe('open');
    });
  });
});
