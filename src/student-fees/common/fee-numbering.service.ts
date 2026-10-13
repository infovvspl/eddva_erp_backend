import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Per-institute, per-year sequential receipt numbers: FEE/<year>/00001. Must be called inside a transaction to serialize concurrent payments. */
@Injectable()
export class FeeNumberingService {
  async nextReceiptNumber(instituteId: string, tx: Prisma.TransactionClient, year: number = new Date().getFullYear()): Promise<string> {
    const seq = await tx.feeNumberSequence.upsert({
      where: { institute_id_year: { institute_id: instituteId, year } },
      create: { institute_id: instituteId, year, last_number: 1 },
      update: { last_number: { increment: 1 } },
    });
    return `FEE/${year}/${String(seq.last_number).padStart(5, '0')}`;
  }
}
