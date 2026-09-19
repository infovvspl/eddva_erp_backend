import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type AdmissionSequenceType =
  'APPLICATION' | 'HALL_TICKET' | 'RECEIPT' | 'ENROLLMENT';

const PREFIX: Record<AdmissionSequenceType, string> = {
  APPLICATION: 'APP',
  HALL_TICKET: 'HT',
  RECEIPT: 'RCPT',
  ENROLLMENT: 'ENR',
};

/**
 * Module-local, concurrency-safe document numbers (e.g. `APP/2026-27/00001`).
 * Same atomic-upsert technique as the shared NumberingService but backed by
 * this module's own `admission_number_sequences` table, so Admission needs no
 * changes to (and no dependency on) shared numbering.
 *
 * Pass the active transaction client so a rolled-back operation also rolls back
 * its number — the sequence row lock is held until that transaction ends.
 */
@Injectable()
export class AdmissionNumberingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Financial year string, e.g. "2026-27" for April 2026 – March 2027. */
  getFinancialYear(date: Date = new Date()): string {
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const startYear = month >= 4 ? year : year - 1;
    return `${startYear}-${String(startYear + 1).slice(-2)}`;
  }

  async next(
    type: AdmissionSequenceType,
    tx?: Prisma.TransactionClient,
    date: Date = new Date(),
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const fy = this.getFinancialYear(date);
    const prefix = `${PREFIX[type]}/${fy}/`;

    const rows = await client.$queryRaw<
      Array<{ current_number: number; prefix: string }>
    >`
      INSERT INTO admission_number_sequences (sequence_type, financial_year, prefix, current_number)
      VALUES (${type}, ${fy}, ${prefix}, 1)
      ON CONFLICT (sequence_type, financial_year)
      DO UPDATE SET current_number = admission_number_sequences.current_number + 1
      RETURNING current_number, prefix
    `;

    const row = rows[0];
    return `${row.prefix}${String(row.current_number).padStart(5, '0')}`;
  }
}
