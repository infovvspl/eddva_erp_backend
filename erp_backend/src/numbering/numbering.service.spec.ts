import { Test, TestingModule } from '@nestjs/testing';
import { NumberingService } from './numbering.service';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentType } from '@prisma/client';

describe('NumberingService', () => {
  let service: NumberingService;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NumberingService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<NumberingService>(NumberingService);
  });

  it('should calculate correct financial year', () => {
    // April 2026 -> 2026-27
    const date1 = new Date('2026-04-15');
    expect(service.getFinancialYear(date1)).toBe('2026-27');

    // March 2027 -> 2026-27
    const date2 = new Date('2027-03-20');
    expect(service.getFinancialYear(date2)).toBe('2026-27');

    // January 2026 -> 2025-26
    const date3 = new Date('2026-01-10');
    expect(service.getFinancialYear(date3)).toBe('2025-26');
  });

  it('should generate document number with padded counter', async () => {
    mockPrismaService.$queryRaw.mockResolvedValue([
      { currentNumber: 5, prefix: 'PO/2026-27/' },
    ]);

    const docNum = await service.generateNextNumber(DocumentType.PO, new Date('2026-05-01'));
    expect(docNum).toBe('PO/2026-27/00005');
  });
});
