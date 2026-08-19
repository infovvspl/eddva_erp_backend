import { Injectable } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NumberingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get current financial year string (e.g., "2026-27" for April 2026 - March 2027)
   */
  getFinancialYear(date: Date = new Date()): string {
    const month = date.getMonth() + 1; // 1-12
    const year = date.getFullYear();

    let startYear: number;
    let endYear: number;

    if (month >= 4) {
      startYear = year;
      endYear = year + 1;
    } else {
      startYear = year - 1;
      endYear = year;
    }

    const endYearStr = String(endYear).slice(-2);
    return `${startYear}-${endYearStr}`;
  }

  /**
   * Default prefix mapping by DocumentType
   */
  getPrefix(documentType: DocumentType, financialYear: string): string {
    switch (documentType) {
      case DocumentType.PO:
        return `PO/${financialYear}/`;
      case DocumentType.GRN:
        return `GRN/${financialYear}/`;
      case DocumentType.PURCHASE_INVOICE:
        return `PI/${financialYear}/`;
      case DocumentType.SALES_ORDER:
        return `SO/${financialYear}/`;
      case DocumentType.SALES_INVOICE:
        return `SI/${financialYear}/`;
      case DocumentType.PAYMENT:
        return `PAYMENT/${financialYear}/`;
      case DocumentType.RECEIPT:
        return `RECEIPT/${financialYear}/`;
      default:
        return `DOC/${financialYear}/`;
    }
  }

  /**
   * Concurrency-safe document number generation using atomic transaction with row locking
   */
  async generateNextNumber(
    documentType: DocumentType,
    date: Date = new Date(),
    txPrisma?: any,
  ): Promise<string> {
    const client = txPrisma || this.prisma;
    const fy = this.getFinancialYear(date);
    const prefix = this.getPrefix(documentType, fy);

    // Upsert sequence atomically within transaction
    const sequence = await client.$queryRaw`
      INSERT INTO number_sequences (id, "documentType", "financialYear", prefix, "currentNumber")
      VALUES (gen_random_uuid(), ${documentType}::"DocumentType", ${fy}, ${prefix}, 1)
      ON CONFLICT ("documentType", "financialYear")
      DO UPDATE SET "currentNumber" = number_sequences."currentNumber" + 1
      RETURNING "currentNumber", prefix;
    `;

    const row = sequence[0];
    const nextNum = row.currentNumber;
    const paddedNum = String(nextNum).padStart(5, '0');

    return `${row.prefix}${paddedNum}`;
  }
}
