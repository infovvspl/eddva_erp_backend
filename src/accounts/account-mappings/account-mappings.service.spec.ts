import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AccountMappingsService } from './account-mappings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsAuditService } from '../common/accounts-audit.service';

describe('AccountMappingsService.resolve — tenant isolation', () => {
  let service: AccountMappingsService;

  const mockPrisma = {
    accountMapping: { findFirst: jest.fn() },
    ledgerAccount: { findFirst: jest.fn() },
  };
  const mockAudit = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountMappingsService, { provide: PrismaService, useValue: mockPrisma }, { provide: AccountsAuditService, useValue: mockAudit }],
    }).compile();
    service = module.get(AccountMappingsService);
  });

  it('always scopes the mapping lookup to the institute', async () => {
    mockPrisma.accountMapping.findFirst.mockResolvedValue({ accountId: 'acc-ar' });
    await expect(service.resolve('AR', 'inst-1')).resolves.toBe('acc-ar');
    expect(mockPrisma.accountMapping.findFirst).toHaveBeenCalledWith({ where: { mappingKey: 'AR', instituteId: 'inst-1' } });
  });

  it('fails closed without an institute rather than returning any tenant\'s mapping', async () => {
    await expect(service.resolve('AR', '')).rejects.toThrow(BadRequestException);
    expect(mockPrisma.accountMapping.findFirst).not.toHaveBeenCalled();
  });

  it('reports an unconfigured mapping for this institute', async () => {
    mockPrisma.accountMapping.findFirst.mockResolvedValue(null);
    await expect(service.resolve('AP', 'inst-1')).rejects.toThrow(BadRequestException);
  });
});
