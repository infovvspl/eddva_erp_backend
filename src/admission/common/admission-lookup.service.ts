import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Institute-scoped existence checks shared by every Admission service. Each
 * accepts an optional transaction client so the check participates in the
 * caller's transaction. A row belonging to another institute is reported as
 * "not found", never leaked.
 */
@Injectable()
export class AdmissionLookupService {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Prisma.TransactionClient): Prisma.TransactionClient {
    return tx ?? this.prisma;
  }

  async application(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).admissionApplication.findFirst({
      where: {
        application_id: id,
        institute_id: instituteId,
        deleted_at: null,
      },
    });
    if (!row) throw new NotFoundException(`Application #${id} not found`);
    return row;
  }

  /**
   * Institute-scoped application lookup that also takes a row lock
   * (`SELECT … FOR UPDATE`) held until the surrounding transaction ends. Use it
   * to serialise money/confirmation operations on one application: concurrent
   * requests queue here, then re-read fresh state. MUST be called inside a `$transaction`.
   */
  async lockApplication(
    instituteId: string,
    id: number,
    tx: Prisma.TransactionClient,
  ) {
    const locked = await tx.$queryRaw<
      Array<{ application_id: number }>
    >(Prisma.sql`
      SELECT application_id FROM admission_applications
      WHERE application_id = ${id} AND institute_id = ${instituteId} AND deleted_at IS NULL
      FOR UPDATE
    `);
    if (locked.length === 0)
      throw new NotFoundException(`Application #${id} not found`);
    return this.application(instituteId, id, tx);
  }

  async session(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).admissionAcademicSession.findFirst({
      where: { session_id: id, institute_id: instituteId, deleted_at: null },
    });
    if (!row) throw new NotFoundException(`Academic session #${id} not found`);
    return row;
  }

  async program(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).admissionProgram.findFirst({
      where: { program_id: id, institute_id: instituteId, deleted_at: null },
    });
    if (!row) throw new NotFoundException(`Program #${id} not found`);
    return row;
  }

  async applicant(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).admissionApplicant.findFirst({
      where: { applicant_id: id, institute_id: instituteId, deleted_at: null },
    });
    if (!row) throw new NotFoundException(`Applicant #${id} not found`);
    return row;
  }

  async enquiry(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).admissionEnquiry.findFirst({
      where: { enquiry_id: id, institute_id: instituteId, deleted_at: null },
    });
    if (!row) throw new NotFoundException(`Enquiry #${id} not found`);
    return row;
  }

  async test(instituteId: string, id: number, tx?: Prisma.TransactionClient) {
    const row = await this.db(tx).admissionEntranceTest.findFirst({
      where: { test_id: id, institute_id: instituteId, deleted_at: null },
    });
    if (!row) throw new NotFoundException(`Entrance test #${id} not found`);
    return row;
  }

  async interview(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).admissionInterview.findFirst({
      where: {
        interview_id: id,
        application: { institute_id: instituteId, deleted_at: null },
      },
    });
    if (!row) throw new NotFoundException(`Interview #${id} not found`);
    return row;
  }

  async meritList(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).admissionMeritList.findFirst({
      where: { merit_list_id: id, institute_id: instituteId, deleted_at: null },
    });
    if (!row) throw new NotFoundException(`Merit list #${id} not found`);
    return row;
  }

  /** Active staff assignment in this institute — the only valid target for "assigned_to" / panelist ids. */
  async staffMember(
    instituteId: string,
    eddvaUserId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).admissionUserDynamicRole.findFirst({
      where: {
        institute_id: instituteId,
        eddva_user_id: eddvaUserId,
        is_active: true,
      },
      select: { eddva_user_id: true, user_name: true },
    });
    if (!row) {
      throw new NotFoundException(
        `No active admission staff member with id "${eddvaUserId}" in this institute`,
      );
    }
    return row;
  }
}
