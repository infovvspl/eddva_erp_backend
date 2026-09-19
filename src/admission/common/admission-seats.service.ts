import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessException } from './business-exception';
import { HttpStatus } from '@nestjs/common';

/**
 * Seat accounting. A seat is *held* by an offer that is `offered` or `accepted`
 * while its application is still `offered` (offer outstanding) or `admitted`
 * (confirmed). Declined/expired offers and cancelled applications free the seat.
 * Capacity is `AdmissionProgram.total_seats` per academic session.
 */
@Injectable()
export class AdmissionSeatsService {
  constructor(private readonly prisma: PrismaService) {}

  async countHeld(
    tx: Prisma.TransactionClient,
    programId: number,
    sessionId: number,
  ): Promise<number> {
    return tx.admissionOffer.count({
      where: {
        status: { in: ['offered', 'accepted'] },
        application: {
          program_id: programId,
          session_id: sessionId,
          deleted_at: null,
          status: { in: ['offered', 'admitted'] },
        },
      },
    });
  }

  /**
   * Serialises seat allocation for a program: takes a row lock on the program
   * (held until the surrounding transaction ends), then checks capacity. Two
   * concurrent offers for the last seat therefore cannot both pass the check —
   * the second waits for the first to commit and then sees the seat as held.
   * MUST be called inside a `$transaction`.
   */
  async lockAndAssertSeatAvailable(
    tx: Prisma.TransactionClient,
    programId: number,
    sessionId: number,
  ): Promise<{ total_seats: number; held: number }> {
    const rows = await tx.$queryRaw<Array<{ total_seats: number }>>(Prisma.sql`
      SELECT total_seats FROM admission_programs
      WHERE program_id = ${programId}
      FOR UPDATE
    `);
    const totalSeats = rows[0]?.total_seats ?? 0;
    const held = await this.countHeld(tx, programId, sessionId);

    if (held >= totalSeats) {
      throw new BusinessException(
        'NO_SEATS_AVAILABLE',
        'No seats are available for this program and session.',
        { total_seats: totalSeats, held },
        HttpStatus.CONFLICT,
      );
    }
    return { total_seats: totalSeats, held };
  }

  /** Highest number of seats currently held in any one session — a program's capacity cannot drop below it. */
  async maxHeldAcrossSessions(programId: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<
      Array<{ held: number }>
    >(Prisma.sql`
      SELECT COUNT(*)::int AS held
      FROM admission_offers o
      JOIN admission_applications a ON a.application_id = o.application_id
      WHERE a.program_id = ${programId}
        AND a.deleted_at IS NULL
        AND o.status IN ('offered', 'accepted')
        AND a.status IN ('offered', 'admitted')
      GROUP BY a.session_id
      ORDER BY held DESC
      LIMIT 1
    `);
    return rows[0]?.held ?? 0;
  }
}
