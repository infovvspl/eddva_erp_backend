import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { VoucherAttachmentsService } from './attachments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsAuditService } from '../common/accounts-audit.service';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

const actor: AccountsPlatformUser = {
  eddva_user_id: 'user-1',
  institute_id: 'inst-1',
  user_name: 'Test Accountant',
  user_role: 'ACCOUNTANT',
  is_institute_admin: false,
};

describe('VoucherAttachmentsService — tenant isolation', () => {
  let service: VoucherAttachmentsService;

  const mockPrisma = {
    voucher: { findFirst: jest.fn() },
    voucherAttachment: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
  };
  const mockAudit = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoucherAttachmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AccountsAuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(VoucherAttachmentsService);
  });

  it("looks an attachment up through its voucher's institute on download", async () => {
    mockPrisma.voucherAttachment.findFirst.mockResolvedValue(null);
    await expect(service.getFileForDownload('att-1', actor)).rejects.toThrow(NotFoundException);
    expect(mockPrisma.voucherAttachment.findFirst).toHaveBeenCalledWith({
      where: { id: 'att-1', voucher: { instituteId: 'inst-1' } },
    });
  });

  it("reports another institute's attachment as not found rather than serving it", async () => {
    // The scoped query returns nothing for a foreign id, exactly as the DB would.
    mockPrisma.voucherAttachment.findFirst.mockResolvedValue(null);
    await expect(service.getFileForDownload('foreign-att', actor)).rejects.toThrow(NotFoundException);
  });

  it('does not delete a file or record when the attachment belongs to another institute', async () => {
    mockPrisma.voucherAttachment.findFirst.mockResolvedValue(null);

    await expect(service.remove('foreign-att', actor)).rejects.toThrow(NotFoundException);

    expect(mockPrisma.voucherAttachment.delete).not.toHaveBeenCalled();
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  it("removes an attachment that belongs to the caller's institute", async () => {
    mockPrisma.voucherAttachment.findFirst.mockResolvedValue({ id: 'att-1', fileUrl: 'uploads/accounts/v1/a.pdf' });

    await expect(service.remove('att-1', actor)).resolves.toEqual({ deleted: true });
    expect(mockPrisma.voucherAttachment.findFirst).toHaveBeenCalledWith({
      where: { id: 'att-1', voucher: { instituteId: 'inst-1' } },
    });
    expect(mockPrisma.voucherAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
  });
});
