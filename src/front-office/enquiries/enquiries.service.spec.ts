import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EnquiriesService } from './enquiries.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FrontOfficeAuditService } from '../common/front-office-audit.service';
import { FrontOfficeNotificationService } from '../notifications/front-office-notification.service';

const INST = 'inst-1';

describe('EnquiriesService', () => {
  let service: EnquiriesService;

  const mockPrisma = {
    frontOfficeEmployee: { findFirst: jest.fn() },
    frontOfficeEnquiry: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
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

  it('refuses a missing institute instead of running an unfiltered query', async () => {
    await expect(service.changeStatus('', 1, { status: 'in_progress' as any }, 'user-1')).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.frontOfficeEnquiry.findFirst).not.toHaveBeenCalled();
  });

  it('cannot change status or add a follow-up on another institute\'s enquiry', async () => {
    mockPrisma.frontOfficeEnquiry.findFirst.mockResolvedValue(null);
    await expect(service.changeStatus(INST, 1, { status: 'in_progress' as any }, 'user-1')).rejects.toThrow(NotFoundException);
    await expect(service.createFollowup(INST, 1, { notes: 'x' } as any, 'user-1')).rejects.toThrow(NotFoundException);
  });

  describe('changeStatus — workflow enforcement', () => {
    it('allows open -> in_progress', async () => {
      mockPrisma.frontOfficeEnquiry.findFirst.mockResolvedValue({ enquiry_id: 1, status: 'open' });
      mockPrisma.frontOfficeEnquiry.update.mockResolvedValue({ enquiry_id: 1, status: 'in_progress' });

      const result = await service.changeStatus(INST, 1, { status: 'in_progress' as any }, 'user-1');
      expect(result.status).toBe('in_progress');
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'status_change', oldStatus: 'open', newStatus: 'in_progress' }));
    });

    it('allows open -> closed directly (skip-ahead permitted for quick resolutions)', async () => {
      mockPrisma.frontOfficeEnquiry.findFirst.mockResolvedValue({ enquiry_id: 1, status: 'open' });
      mockPrisma.frontOfficeEnquiry.update.mockResolvedValue({ enquiry_id: 1, status: 'closed' });

      const result = await service.changeStatus(INST, 1, { status: 'closed' as any }, 'user-1');
      expect(result.status).toBe('closed');
    });

    it('rejects closed -> in_progress (terminal state)', async () => {
      mockPrisma.frontOfficeEnquiry.findFirst.mockResolvedValue({ enquiry_id: 1, status: 'closed' });

      await expect(service.changeStatus(INST, 1, { status: 'in_progress' as any }, 'user-1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.frontOfficeEnquiry.update).not.toHaveBeenCalled();
    });

    it('rejects in_progress -> open (no reopening for enquiries)', async () => {
      mockPrisma.frontOfficeEnquiry.findFirst.mockResolvedValue({ enquiry_id: 1, status: 'in_progress' });

      await expect(service.changeStatus(INST, 1, { status: 'open' as any }, 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('createFollowup', () => {
    it('auto-advances an open enquiry to in_progress when a follow-up is logged', async () => {
      mockPrisma.frontOfficeEnquiry.findFirst.mockResolvedValue({ enquiry_id: 1, status: 'open' });
      mockPrisma.frontOfficeEnquiryFollowup.create.mockResolvedValue({ followup_id: 1, enquiry_id: 1 });

      await service.createFollowup(INST, 1, { notes: 'Called enquirer' }, 'user-1');

      expect(mockPrisma.frontOfficeEnquiry.update).toHaveBeenCalledWith({ where: { enquiry_id: 1 }, data: { status: 'in_progress' } });
    });

    it('rejects adding a follow-up to a closed enquiry', async () => {
      mockPrisma.frontOfficeEnquiry.findFirst.mockResolvedValue({ enquiry_id: 1, status: 'closed' });

      await expect(service.createFollowup(INST, 1, { notes: 'too late' }, 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('assign', () => {
    it('cannot assign to another institute\'s employee', async () => {
      mockPrisma.frontOfficeEnquiry.findFirst.mockResolvedValue({ enquiry_id: 1, enquirer_name: 'Anita', assigned_to: null });
      mockPrisma.frontOfficeEmployee.findFirst.mockResolvedValue(null);
      await expect(service.assign(INST, 1, { assigned_to: 2 }, 'user-1')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.frontOfficeEmployee.findFirst).toHaveBeenCalledWith({ where: { employee_id: 2, institute_id: INST } });
    });

    it('notifies the newly assigned employee and audits assign vs reassign correctly', async () => {
      mockPrisma.frontOfficeEnquiry.findFirst.mockResolvedValue({ enquiry_id: 1, enquirer_name: 'Anita', assigned_to: null });
      mockPrisma.frontOfficeEmployee.findFirst.mockResolvedValue({ employee_id: 2, name: 'Meera' });
      mockPrisma.frontOfficeEnquiry.update.mockResolvedValue({ enquiry_id: 1, assigned_to: 2 });

      await service.assign(INST, 1, { assigned_to: 2 }, 'user-1');

      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'assign' }));
      expect(mockNotifications.send).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'enquiry_assigned', recipientEmployeeId: 2 }));
    });

    it('labels a second assignment as reassign, not assign', async () => {
      mockPrisma.frontOfficeEnquiry.findFirst.mockResolvedValue({ enquiry_id: 1, enquirer_name: 'Anita', assigned_to: 2 });
      mockPrisma.frontOfficeEmployee.findFirst.mockResolvedValue({ employee_id: 3, name: 'Deepak' });
      mockPrisma.frontOfficeEnquiry.update.mockResolvedValue({ enquiry_id: 1, assigned_to: 3 });

      await service.assign(INST, 1, { assigned_to: 3 }, 'user-1');

      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'reassign' }));
    });
  });
});
