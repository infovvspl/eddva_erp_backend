import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { EnquiriesService } from './enquiries.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FrontOfficeAuditService } from '../common/front-office-audit.service';
import { FrontOfficeNotificationService } from '../notifications/front-office-notification.service';

describe('EnquiriesService', () => {
  let service: EnquiriesService;

  const mockPrisma = {
    frontOfficeEmployee: { findUnique: jest.fn() },
    frontOfficeEnquiry: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    frontOfficeEnquiryFollowup: { create: jest.fn() },
  };
  const mockAudit = { log: jest.fn() };
  const mockNotifications = { send: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnquiriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FrontOfficeAuditService, useValue: mockAudit },
        { provide: FrontOfficeNotificationService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get(EnquiriesService);
  });

  describe('changeStatus — workflow enforcement', () => {
    it('allows open -> in_progress', async () => {
      mockPrisma.frontOfficeEnquiry.findUnique.mockResolvedValue({ enquiry_id: 1, status: 'open' });
      mockPrisma.frontOfficeEnquiry.update.mockResolvedValue({ enquiry_id: 1, status: 'in_progress' });

      const result = await service.changeStatus(1, { status: 'in_progress' as any }, 'user-1');
      expect(result.status).toBe('in_progress');
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'status_change', oldStatus: 'open', newStatus: 'in_progress' }));
    });

    it('allows open -> closed directly (skip-ahead permitted for quick resolutions)', async () => {
      mockPrisma.frontOfficeEnquiry.findUnique.mockResolvedValue({ enquiry_id: 1, status: 'open' });
      mockPrisma.frontOfficeEnquiry.update.mockResolvedValue({ enquiry_id: 1, status: 'closed' });

      const result = await service.changeStatus(1, { status: 'closed' as any }, 'user-1');
      expect(result.status).toBe('closed');
    });

    it('rejects closed -> in_progress (terminal state)', async () => {
      mockPrisma.frontOfficeEnquiry.findUnique.mockResolvedValue({ enquiry_id: 1, status: 'closed' });

      await expect(service.changeStatus(1, { status: 'in_progress' as any }, 'user-1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.frontOfficeEnquiry.update).not.toHaveBeenCalled();
    });

    it('rejects in_progress -> open (no reopening for enquiries)', async () => {
      mockPrisma.frontOfficeEnquiry.findUnique.mockResolvedValue({ enquiry_id: 1, status: 'in_progress' });

      await expect(service.changeStatus(1, { status: 'open' as any }, 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('createFollowup', () => {
    it('auto-advances an open enquiry to in_progress when a follow-up is logged', async () => {
      mockPrisma.frontOfficeEnquiry.findUnique.mockResolvedValue({ enquiry_id: 1, status: 'open' });
      mockPrisma.frontOfficeEnquiryFollowup.create.mockResolvedValue({ followup_id: 1, enquiry_id: 1 });

      await service.createFollowup(1, { notes: 'Called enquirer' }, 'user-1');

      expect(mockPrisma.frontOfficeEnquiry.update).toHaveBeenCalledWith({ where: { enquiry_id: 1 }, data: { status: 'in_progress' } });
    });

    it('rejects adding a follow-up to a closed enquiry', async () => {
      mockPrisma.frontOfficeEnquiry.findUnique.mockResolvedValue({ enquiry_id: 1, status: 'closed' });

      await expect(service.createFollowup(1, { notes: 'too late' }, 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('assign', () => {
    it('notifies the newly assigned employee and audits assign vs reassign correctly', async () => {
      mockPrisma.frontOfficeEnquiry.findUnique.mockResolvedValue({ enquiry_id: 1, enquirer_name: 'Anita', assigned_to: null });
      mockPrisma.frontOfficeEmployee.findUnique.mockResolvedValue({ employee_id: 2, name: 'Meera' });
      mockPrisma.frontOfficeEnquiry.update.mockResolvedValue({ enquiry_id: 1, assigned_to: 2 });

      await service.assign(1, { assigned_to: 2 }, 'user-1');

      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'assign' }));
      expect(mockNotifications.send).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'enquiry_assigned', recipientEmployeeId: 2 }));
    });

    it('labels a second assignment as reassign, not assign', async () => {
      mockPrisma.frontOfficeEnquiry.findUnique.mockResolvedValue({ enquiry_id: 1, enquirer_name: 'Anita', assigned_to: 2 });
      mockPrisma.frontOfficeEmployee.findUnique.mockResolvedValue({ employee_id: 3, name: 'Deepak' });
      mockPrisma.frontOfficeEnquiry.update.mockResolvedValue({ enquiry_id: 1, assigned_to: 3 });

      await service.assign(1, { assigned_to: 3 }, 'user-1');

      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'reassign' }));
    });
  });
});
