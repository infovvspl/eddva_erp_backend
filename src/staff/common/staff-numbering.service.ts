import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type StaffSequenceType = 'STAFF';

const PREFIX: Record<StaffSequenceType, string> = {
  STAFF: 'STF',
};

/**
 * Module-local, concurrency-safe document numbers (e.g. `STF/2026-27/00001`).
 * Same atomic-upsert technique as HostelNumberingService, backed by this
 * module's own `staff_number_sequences` table.
 */
@Injectable()
export class StaffNumberingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Financial year string, e.g. "2026-27" for April 2026 – March 2027. */
  getFinancialYear(date: Date = new Date()): string {
    const month = date.getUTCMonth() + 1;
    const year = date.getUTCFullYear();
    const startYear = month >= 4 ? year : year - 1;
    return `${startYear}-${String(startYear + 1).slice(-2)}`;
  }

  async next(
    type: StaffSequenceType,
    tx?: Prisma.TransactionClient,
    date: Date = new Date(),
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const fy = this.getFinancialYear(date);
    const prefix = `${PREFIX[type]}/${fy}/`;

    const rows = await client.$queryRaw<
      Array<{ current_number: number; prefix: string }>
    >`
      INSERT INTO staff_number_sequences (sequence_type, financial_year, prefix, current_number)
      VALUES (${type}, ${fy}, ${prefix}, 1)
      ON CONFLICT (sequence_type, financial_year)
      DO UPDATE SET current_number = staff_number_sequences.current_number + 1
      RETURNING current_number, prefix
    `;

    const row = rows[0];
    return `${row.prefix}${String(row.current_number).padStart(5, '0')}`;
  }
}
