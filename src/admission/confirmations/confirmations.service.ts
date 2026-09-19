import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { AdmissionAuditService } from '../common/admission-audit.service';
import { AdmissionLookupService } from '../common/admission-lookup.service';
import { AdmissionNumberingService } from '../common/admission-numbering.service';
import { ADM_ENTITY } from '../common/admission-entities';
import { computeFeeSummary } from '../common/admission-fee.util';
import { BusinessException } from '../common/business-exception';
import { moveApplicationStatusOrConflict } from '../common/application-state';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
} from '../common/pagination.util';
import { AdmissionNotificationService } from '../notifications/admission-notification.service';
import {
  CancelConfirmationDto,
  LinkStudentDto,
  QueryConfirmationDto,
} from './dto/confirmation.dto';

const INCLUDE = {
  application: {
    select: {
      application_id: true,
      application_number: true,
      status: true,
      applicant: {
        select: { applicant_id: true, name: true, email: true, phone: true },
      },
      program: { select: { program_id: true, name: true } },
      session: { select: { session_id: true, name: true } },
    },
  },
} satisfies Prisma.AdmissionConfirmationInclude;

@Injectable()
export class ConfirmationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AdmissionLookupService,
    private readonly numbering: AdmissionNumberingService,
    private readonly audit: AdmissionAuditService,
    private readonly notifications: AdmissionNotificationService,
  ) {}

  /**
   * Confirms an admission — the boundary between applicant and enrolled student.
   *
   * Everything happens in ONE transaction while the application row is locked:
   *   1. application is `offered` and nothing is confirmed yet
   *   2. the offer is `accepted` (and not past expiry)
   *   3. an admission fee is configured and has been paid in full
   *   4. an enrollment number is issued
   *   5. the confirmation row is created
   *   6. the application moves offered → admitted
   * Any failed rule aborts the whole thing — no partial confirmation, and the
   * enrollment number is rolled back with it. The row lock plus the unique
   * constraint on application_id make a double-click / retry a clean 409.
   *
   * No Student record exists in this backend, so none is created or faked: the
   * confirmation is recorded with `student_link_status = pending` for the school
   * core to pick up (GET /confirmations?student_link_status=pending) and report
   * back through POST /confirmations/:id/link-student.
   */
  async confirm(actor: AdmissionPlatformUser, applicationId: number) {
    const now = new Date();
    const confirmation = await this.prisma.$transaction(async (tx) => {
      const application = await this.lookup.lockApplication(
        actor.institute_id,
        applicationId,
        tx,
      );

      const existing = await tx.admissionConfirmation.findUnique({
        where: { application_id: applicationId },
      });
      if (existing) {
        throw new BusinessException(
          existing.status === 'confirmed'
            ? 'ADMISSION_ALREADY_CONFIRMED'
            : 'CONFIRMATION_CANCELLED',
          existing.status === 'confirmed'
            ? 'This application has already been confirmed.'
            : 'The confirmation for this application was cancelled and cannot be re-confirmed.',
          {
            enrollment_number: existing.enrollment_number,
            confirmed_date: existing.confirmed_date,
          },
          HttpStatus.CONFLICT,
        );
      }
      if (application.status !== 'offered') {
        throw new BusinessException(
          'APPLICATION_NOT_OFFERED',
          application.status === 'admitted'
            ? 'This application has already been confirmed.'
            : `Admission can only be confirmed for an application with an accepted offer (currently "${application.status}").`,
          { status: application.status },
          application.status === 'admitted'
            ? HttpStatus.CONFLICT
            : HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      const offer = await tx.admissionOffer.findUnique({
        where: { application_id: applicationId },
      });
      if (offer?.status !== 'accepted') {
        throw new BusinessException(
          offer?.status === 'expired' ? 'OFFER_EXPIRED' : 'OFFER_NOT_ACCEPTED',
          offer?.status === 'expired'
            ? 'This offer has already expired.'
            : 'Admission cannot be confirmed until the offer has been accepted.',
          { offer_status: offer?.status ?? null },
        );
      }

      const fee = await computeFeeSummary(tx, application);
      if (!fee.fee_structure_configured) {
        throw new BusinessException(
          'ADMISSION_FEE_NOT_CONFIGURED',
          'Admission cannot be confirmed: no admission fee is configured for this program and session.',
        );
      }
      if (!fee.is_paid) {
        throw new BusinessException(
          'ADMISSION_FEE_NOT_PAID',
          'Admission cannot be confirmed until the admission fee is paid.',
          {
            required: fee.required!.toString(),
            paid: fee.paid.toString(),
            balance: fee.balance!.toString(),
          },
        );
      }

      const created = await tx.admissionConfirmation.create({
        data: {
          application_id: applicationId,
          confirmed_date: now,
          enrollment_number: await this.numbering.next('ENROLLMENT', tx, now),
          confirmed_by: actor.eddva_user_id,
        },
        include: INCLUDE,
      });
      await moveApplicationStatusOrConflict(
        tx,
        applicationId,
        ['offered'],
        'admitted',
      );
      return created;
    });

    await this.audit.log(actor, {
      entityType: ADM_ENTITY.CONFIRMATION,
      entityId: String(confirmation.confirmation_id),
      action: 'confirm',
      newStatus: 'confirmed',
      metadata: {
        application_id: applicationId,
        enrollment_number: confirmation.enrollment_number,
      },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.APPLICATION,
      entityId: String(applicationId),
      action: 'status_change',
      oldStatus: 'offered',
      newStatus: 'admitted',
      reason: 'Admission confirmed',
      metadata: {
        application_id: applicationId,
        enrollment_number: confirmation.enrollment_number,
      },
    });
    const applicant = confirmation.application.applicant;
    await this.notifications.queue({
      instituteId: actor.institute_id,
      entityType: ADM_ENTITY.CONFIRMATION,
      entityId: confirmation.confirmation_id,
      eventType: 'admission_confirmed',
      recipient: applicant.email ?? applicant.phone,
      channel: applicant.email ? 'email' : 'sms',
      message: `Admission confirmed. Enrollment number ${confirmation.enrollment_number}.`,
    });
    return this.present(confirmation);
  }

  /** Cancels a confirmation and the admission: application → cancelled, seat released. Blocked once a Student is linked. */
  async cancel(
    actor: AdmissionPlatformUser,
    applicationId: number,
    dto: CancelConfirmationDto,
  ) {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      await this.lookup.lockApplication(actor.institute_id, applicationId, tx);
      const existing = await tx.admissionConfirmation.findUnique({
        where: { application_id: applicationId },
      });
      if (!existing)
        throw new NotFoundException(
          `Application #${applicationId} has no confirmation`,
        );
      if (existing.status === 'cancelled') {
        throw new BusinessException(
          'CONFIRMATION_ALREADY_CANCELLED',
          'This confirmation has already been cancelled.',
          undefined,
          HttpStatus.CONFLICT,
        );
      }
      if (existing.student_link_status === 'linked') {
        throw new BusinessException(
          'STUDENT_ALREADY_CREATED',
          'A Student record has already been created for this admission, so it cannot be cancelled here.',
          { student_ref: existing.student_ref },
        );
      }

      const result = await tx.admissionConfirmation.updateMany({
        where: {
          confirmation_id: existing.confirmation_id,
          status: 'confirmed',
          student_link_status: 'pending',
        },
        data: {
          status: 'cancelled',
          cancelled_at: new Date(),
          cancelled_by: actor.eddva_user_id,
          cancellation_reason: dto.reason,
        },
      });
      if (result.count === 0) {
        throw new BusinessException(
          'CONFIRMATION_STATUS_CONFLICT',
          'Another user has already processed this admission.',
          undefined,
          HttpStatus.CONFLICT,
        );
      }
      await moveApplicationStatusOrConflict(
        tx,
        applicationId,
        ['admitted'],
        'cancelled',
      );
      return tx.admissionConfirmation.findUniqueOrThrow({
        where: { confirmation_id: existing.confirmation_id },
        include: INCLUDE,
      });
    });

    await this.audit.log(actor, {
      entityType: ADM_ENTITY.CONFIRMATION,
      entityId: String(cancelled.confirmation_id),
      action: 'cancel',
      oldStatus: 'confirmed',
      newStatus: 'cancelled',
      reason: dto.reason,
      metadata: {
        application_id: applicationId,
        enrollment_number: cancelled.enrollment_number,
      },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.APPLICATION,
      entityId: String(applicationId),
      action: 'status_change',
      oldStatus: 'admitted',
      newStatus: 'cancelled',
      reason: dto.reason,
      metadata: { application_id: applicationId },
    });
    return this.present(cancelled);
  }

  /** Records that the school core has created the Student for this confirmed admission. */
  async linkStudent(
    actor: AdmissionPlatformUser,
    confirmationId: number,
    dto: LinkStudentDto,
  ) {
    const existing = await this.prisma.admissionConfirmation.findFirst({
      where: {
        confirmation_id: confirmationId,
        application: { institute_id: actor.institute_id, deleted_at: null },
      },
    });
    if (!existing)
      throw new NotFoundException(`Confirmation #${confirmationId} not found`);

    const result = await this.prisma.admissionConfirmation.updateMany({
      where: {
        confirmation_id: confirmationId,
        status: 'confirmed',
        student_link_status: 'pending',
      },
      data: {
        student_ref: dto.student_ref.trim(),
        student_link_status: 'linked',
      },
    });
    if (result.count === 0) {
      throw new BusinessException(
        'STUDENT_LINK_NOT_ALLOWED',
        existing.status !== 'confirmed'
          ? 'Only a confirmed admission can be linked to a Student.'
          : 'A Student is already linked to this admission.',
        {
          status: existing.status,
          student_link_status: existing.student_link_status,
        },
        HttpStatus.CONFLICT,
      );
    }
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.CONFIRMATION,
      entityId: String(confirmationId),
      action: 'link_student',
      metadata: {
        application_id: existing.application_id,
        student_ref: dto.student_ref.trim(),
      },
    });
    return this.findOne(actor.institute_id, confirmationId);
  }

  private present<
    T extends { student_ref: string | null; student_link_status: string },
  >(row: T) {
    return {
      ...row,
      student: {
        status: row.student_link_status,
        student_ref: row.student_ref,
        note:
          row.student_link_status === 'pending'
            ? 'The Student record is created downstream by the school core; it will be linked here once created.'
            : null,
      },
    };
  }

  async getForApplication(instituteId: string, applicationId: number) {
    await this.lookup.application(instituteId, applicationId);
    const confirmation = await this.prisma.admissionConfirmation.findUnique({
      where: { application_id: applicationId },
      include: INCLUDE,
    });
    if (!confirmation)
      throw new NotFoundException(
        `Application #${applicationId} has no confirmation`,
      );
    return this.present(confirmation);
  }

  async findOne(instituteId: string, id: number) {
    const confirmation = await this.prisma.admissionConfirmation.findFirst({
      where: {
        confirmation_id: id,
        application: { institute_id: instituteId, deleted_at: null },
      },
      include: INCLUDE,
    });
    if (!confirmation)
      throw new NotFoundException(`Confirmation #${id} not found`);
    return this.present(confirmation);
  }

  async findAll(instituteId: string, query: QueryConfirmationDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.AdmissionConfirmationWhereInput = {
      status: query.status,
      student_link_status: query.student_link_status,
      confirmed_date: buildDateRange(query.from, query.to),
      application: {
        institute_id: instituteId,
        deleted_at: null,
        program_id: query.program_id,
        session_id: query.session_id,
      },
      ...(query.search
        ? {
            OR: [
              {
                enrollment_number: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                application: {
                  application_number: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                application: {
                  applicant: {
                    name: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.admissionConfirmation.findMany({
        where,
        include: INCLUDE,
        orderBy: { confirmed_date: 'desc' },
        skip,
        take,
      }),
      this.prisma.admissionConfirmation.count({ where }),
    ]);
    return {
      data: rows.map((r) => this.present(r)),
      pagination: buildMeta(total, page, limit),
    };
  }
}
