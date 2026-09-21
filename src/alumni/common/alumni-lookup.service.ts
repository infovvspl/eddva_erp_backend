import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Tables/columns the `lock` helper may target (identifiers are interpolated, so they are whitelisted). */
const LOCKABLE = {
  event: ['alumni_events', 'event_id'],
  job: ['alumni_jobs', 'job_id'],
  mentor: ['alumni_mentor_profiles', 'mentor_id'],
  program: ['alumni_mentorship_programs', 'program_id'],
  campaign: ['alumni_campaigns', 'campaign_id'],
  donation: ['alumni_donations', 'donation_id'],
  newsletter: ['alumni_newsletters', 'newsletter_id'],
  registration: ['alumni_event_registrations', 'registration_id'],
  application: ['alumni_job_applications', 'application_id'],
  profile: ['alumni_profiles', 'alumni_id'],
} as const;

export type LockableEntity = keyof typeof LOCKABLE;

/**
 * Institute-scoped existence checks shared by every Alumni service. Each accepts
 * an optional transaction client so the check participates in the caller's
 * transaction. A row belonging to another institute is reported as "not
 * found", never leaked.
 *
 * `lock` takes a `SELECT … FOR UPDATE` row lock held until the surrounding
 * transaction ends, serialising the operations that must not race (seats of one
 * event, capacity of one mentor, totals of one campaign, transitions of one
 * donation). It MUST be called inside `$transaction`.
 */
@Injectable()
export class AlumniLookupService {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Prisma.TransactionClient): Prisma.TransactionClient {
    return tx ?? this.prisma;
  }

  /** Locks one row (after asserting it belongs to the institute) until the transaction ends. */
  async lock(
    tx: Prisma.TransactionClient,
    entity: LockableEntity,
    instituteId: string,
    id: number,
  ): Promise<void> {
    const [table, column] = LOCKABLE[entity];
    const rows = await tx.$queryRaw<Array<{ ok: number }>>(
      Prisma.sql`SELECT 1 AS ok FROM ${Prisma.raw(`"${table}"`)} WHERE ${Prisma.raw(`"${column}"`)} = ${id} AND "institute_id" = ${instituteId} FOR UPDATE`,
    );
    if (rows.length === 0) {
      throw new NotFoundException(`${entity} #${id} not found`);
    }
  }

  async profile(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).alumniProfile.findFirst({
      where: { alumni_id: id, institute_id: instituteId },
    });
    if (!row) throw new NotFoundException(`Alumni #${id} not found`);
    return row;
  }

  async employment(
    instituteId: string,
    alumniId: number,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).alumniEmployment.findFirst({
      where: {
        employment_id: id,
        alumni_id: alumniId,
        institute_id: instituteId,
        is_active: true,
      },
    });
    if (!row) throw new NotFoundException(`Employment #${id} not found`);
    return row;
  }

  async group(instituteId: string, id: number, tx?: Prisma.TransactionClient) {
    const row = await this.db(tx).alumniGroup.findFirst({
      where: { group_id: id, institute_id: instituteId },
    });
    if (!row) throw new NotFoundException(`Alumni group #${id} not found`);
    return row;
  }

  async event(instituteId: string, id: number, tx?: Prisma.TransactionClient) {
    const row = await this.db(tx).alumniEvent.findFirst({
      where: { event_id: id, institute_id: instituteId },
    });
    if (!row) throw new NotFoundException(`Event #${id} not found`);
    return row;
  }

  async registration(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).alumniEventRegistration.findFirst({
      where: { registration_id: id, institute_id: instituteId },
      include: { event: true },
    });
    if (!row)
      throw new NotFoundException(`Event registration #${id} not found`);
    return row;
  }

  async job(instituteId: string, id: number, tx?: Prisma.TransactionClient) {
    const row = await this.db(tx).alumniJob.findFirst({
      where: { job_id: id, institute_id: instituteId },
    });
    if (!row) throw new NotFoundException(`Job #${id} not found`);
    return row;
  }

  async application(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).alumniJobApplication.findFirst({
      where: { application_id: id, institute_id: instituteId },
      include: { job: true },
    });
    if (!row) throw new NotFoundException(`Job application #${id} not found`);
    return row;
  }

  async program(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).alumniMentorshipProgram.findFirst({
      where: { program_id: id, institute_id: instituteId },
    });
    if (!row)
      throw new NotFoundException(`Mentorship program #${id} not found`);
    return row;
  }

  async mentor(instituteId: string, id: number, tx?: Prisma.TransactionClient) {
    const row = await this.db(tx).alumniMentorProfile.findFirst({
      where: { mentor_id: id, institute_id: instituteId },
    });
    if (!row) throw new NotFoundException(`Mentor profile #${id} not found`);
    return row;
  }

  async match(instituteId: string, id: number, tx?: Prisma.TransactionClient) {
    const row = await this.db(tx).alumniMentorshipMatch.findFirst({
      where: { match_id: id, institute_id: instituteId },
      include: { mentor: true, program: true },
    });
    if (!row) throw new NotFoundException(`Mentorship match #${id} not found`);
    return row;
  }

  async campaign(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).alumniCampaign.findFirst({
      where: { campaign_id: id, institute_id: instituteId },
    });
    if (!row) throw new NotFoundException(`Campaign #${id} not found`);
    return row;
  }

  async donation(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).alumniDonation.findFirst({
      where: { donation_id: id, institute_id: instituteId },
    });
    if (!row) throw new NotFoundException(`Donation #${id} not found`);
    return row;
  }

  async newsletter(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).alumniNewsletter.findFirst({
      where: { newsletter_id: id, institute_id: instituteId },
    });
    if (!row) throw new NotFoundException(`Newsletter #${id} not found`);
    return row;
  }
}
