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
      case DocumentType.VISITOR_BADGE:
        return `BADGE/${financialYear}/`;
      case DocumentType.CANTEEN_ORDER:
        return `SO/${financialYear}/`;
      case DocumentType.SP_PURCHASE_ORDER:
        return `PO/${financialYear}/`;
      case DocumentType.SP_GRN:
        return `GRN/${financialYear}/`;
      case DocumentType.SP_PURCHASE_INVOICE:
        return `PI/${financialYear}/`;
      case DocumentType.SP_SALES_ORDER:
        return `SPSO/${financialYear}/`;
      case DocumentType.SP_SALES_INVOICE:
        return `SI/${financialYear}/`;
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

  /**
   * Concurrency-safe code generation for master data (vendor/customer/item/
   * warehouse codes) that must NOT reset every financial year. Reuses the
   * same number_sequences table and atomic upsert as generateNextNumber(),
   * keyed on a fixed pseudo financial-year ("GLOBAL") instead of one derived
   * from a date, so the sequence never resets.
   */
  async generateNextCode(
    documentType: DocumentType,
    prefix: string,
    txPrisma?: any,
  ): Promise<string> {
    const client = txPrisma || this.prisma;
    const fy = 'GLOBAL';

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
