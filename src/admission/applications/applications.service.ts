import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdmissionApplication,
  AdmissionApplicationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { AdmissionAccessService } from '../common/admission-access.service';
import { AdmissionAuditService } from '../common/admission-audit.service';
import { AdmissionLookupService } from '../common/admission-lookup.service';
import { AdmissionNumberingService } from '../common/admission-numbering.service';
import { AdmissionSeatsService } from '../common/admission-seats.service';
import { ADM_ENTITY } from '../common/admission-entities';
import { computeFeeSummary } from '../common/admission-fee.util';
import { BusinessException } from '../common/business-exception';
import {
  MANUAL_TRANSITIONS,
  REVIEW_TARGETS,
  assertManualTransition,
  moveApplicationStatusOrConflict,
} from '../common/application-state';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
  parseSort,
  parseSortOrder,
} from '../common/pagination.util';
import { ApplicantsService } from '../applicants/applicants.service';
import { AdmissionNotificationService } from '../notifications/admission-notification.service';
import {
  ChangeApplicationStatusDto,
  CreateApplicationDto,
  QueryApplicationDto,
  UpdateApplicationDto,
} from './dto/application.dto';

const SORT_FIELDS = [
  'application_date',
  'application_number',
  'status',
  'created_at',
] as const;

const REASON_REQUIRED: AdmissionApplicationStatus[] = ['rejected', 'cancelled'];
const EDITABLE_STATUSES: AdmissionApplicationStatus[] = [
  'draft',
  'submitted',
  'under_review',
];
const DELETABLE_STATUSES: AdmissionApplicationStatus[] = [
  'draft',
  'rejected',
  'cancelled',
];
const COMPLETE_PROFILE_FIELDS = [
  'dob',
  'gender',
  'guardian_name',
  'guardian_contact',
] as const;

const today = () => new Date(new Date().toISOString().slice(0, 10));

/** Row shape used to derive the list-view "child status" columns. */
interface ApplicationListRow {
  fee_payments: { status: string }[];
  documents: { verification_status: string }[];
  test_registrations: { status: string }[];
  interview: { status: string } | null;
  offer: { status: string } | null;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AdmissionLookupService,
    private readonly numbering: AdmissionNumberingService,
    private readonly seats: AdmissionSeatsService,
    private readonly applicants: ApplicantsService,
    private readonly access: AdmissionAccessService,
    private readonly audit: AdmissionAuditService,
    private readonly notifications: AdmissionNotificationService,
  ) {}

  // ─── Create (direct, or converting an enquiry) ────────────────────────────

  /**
   * Shared by POST /applications and POST /enquiries/:id/convert. Runs inside
   * the caller's transaction so applicant reuse/creation, the application row,
   * its number and the enquiry → converted move commit or roll back together.
   */
  async createWithinTx(
    tx: Prisma.TransactionClient,
    actor: AdmissionPlatformUser,
    dto: CreateApplicationDto,
  ) {
    if (!!dto.applicant_id === !!dto.applicant) {
      throw new BadRequestException(
        'Provide exactly one of applicant_id (existing applicant) or applicant (new applicant)',
      );
    }

    const session = await this.lookup.session(
      actor.institute_id,
      dto.session_id,
      tx,
    );
    if (session.status === 'closed') {
      throw new BusinessException(
        'SESSION_CLOSED',
        'This academic session is closed and no longer accepts applications.',
        { session_id: session.session_id },
      );
    }
    await this.lookup.program(actor.institute_id, dto.program_id, tx);

    const enquiry = dto.source_enquiry_id
      ? await this.lookup.enquiry(actor.institute_id, dto.source_enquiry_id, tx)
      : null;
    if (enquiry) {
      if (enquiry.status === 'converted') {
        throw new BusinessException(
          'ENQUIRY_ALREADY_CONVERTED',
          'This enquiry has already been converted into an application.',
          { enquiry_id: enquiry.enquiry_id },
          HttpStatus.CONFLICT,
        );
      }
      if (enquiry.status === 'lost') {
        throw new BusinessException(
          'ENQUIRY_LOST',
          'This enquiry is marked lost. Reopen it before converting.',
          { enquiry_id: enquiry.enquiry_id },
        );
      }
    }

    let applicantId: number;
    let applicantReused = false;
    if (dto.applicant_id) {
      applicantId = (
        await this.lookup.applicant(actor.institute_id, dto.applicant_id, tx)
      ).applicant_id;
    } else {
      const result = await this.applicants.createOrReuse(
        tx,
        actor,
        dto.applicant!,
      );
      applicantId = result.applicant.applicant_id;
      applicantReused = result.reused;
    }

    const live = await tx.admissionApplication.findFirst({
      where: {
        applicant_id: applicantId,
        session_id: dto.session_id,
        program_id: dto.program_id,
        deleted_at: null,
        status: { notIn: ['rejected', 'cancelled'] },
      },
      select: { application_id: true, application_number: true },
    });
    if (live) {
      throw new BusinessException(
        'DUPLICATE_APPLICATION',
        `This applicant already has an active application (${live.application_number}) for this program and session.`,
        { existing_application_id: live.application_id },
        HttpStatus.CONFLICT,
      );
    }

    const application = await tx.admissionApplication.create({
      data: {
        institute_id: actor.institute_id,
        applicant_id: applicantId,
        session_id: dto.session_id,
        program_id: dto.program_id,
        application_number: await this.numbering.next('APPLICATION', tx),
        source_enquiry_id: enquiry?.enquiry_id ?? null,
        application_date: dto.application_date
          ? new Date(dto.application_date)
          : today(),
        status: 'draft',
        created_by: actor.eddva_user_id,
      },
      include: { applicant: true },
    });

    if (enquiry) {
      const moved = await tx.admissionEnquiry.updateMany({
        where: {
          enquiry_id: enquiry.enquiry_id,
          status: { in: ['new', 'contacted', 'application_started'] },
        },
        data: { status: 'converted' },
      });
      if (moved.count === 0) {
        throw new BusinessException(
          'ENQUIRY_STATUS_CONFLICT',
          'Another user has already updated this enquiry. Refresh and try again.',
          { enquiry_id: enquiry.enquiry_id },
          HttpStatus.CONFLICT,
        );
      }
    }

    return { application, applicant_reused: applicantReused, enquiry };
  }

  async create(actor: AdmissionPlatformUser, dto: CreateApplicationDto) {
    let result: Awaited<ReturnType<ApplicationsService['createWithinTx']>>;
    try {
      result = await this.prisma.$transaction((tx) =>
        this.createWithinTx(tx, actor, dto),
      );
    } catch (err) {
      throw this.translateUniqueViolation(err);
    }

    const { application, enquiry } = result;
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.APPLICATION,
      entityId: String(application.application_id),
      action: 'create',
      newStatus: application.status,
      metadata: {
        application_id: application.application_id,
        application_number: application.application_number,
        source_enquiry_id: enquiry?.enquiry_id ?? null,
      },
    });
    if (enquiry) {
      await this.audit.log(actor, {
        entityType: ADM_ENTITY.ENQUIRY,
        entityId: String(enquiry.enquiry_id),
        action: 'convert',
        oldStatus: enquiry.status,
        newStatus: 'converted',
        metadata: { application_id: application.application_id },
      });
    }
    return result;
  }

  /** The partial unique index / source_enquiry unique constraint can still fire on a race; surface them as 409s. */
  private translateUniqueViolation(err: unknown): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const target = JSON.stringify(err.meta?.target ?? '');
      if (target.includes('source_enquiry_id')) {
        return new BusinessException(
          'ENQUIRY_ALREADY_CONVERTED',
          'This enquiry has already been converted into an application.',
          undefined,
          HttpStatus.CONFLICT,
        );
      }
      return new BusinessException(
        'DUPLICATE_APPLICATION',
        'This applicant already has an active application for this program and session.',
        undefined,
        HttpStatus.CONFLICT,
      );
    }
    return err;
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  private summarize(row: ApplicationListRow) {
    const fee = row.fee_payments;
    const application_fee_status = fee.some((p) => p.status === 'success')
      ? 'paid'
      : fee.some((p) => p.status === 'pending')
        ? 'pending'
        : fee.length > 0
          ? 'failed'
          : 'none';

    const document_summary = {
      total: row.documents.length,
      pending: row.documents.filter((d) => d.verification_status === 'pending')
        .length,
      verified: row.documents.filter(
        (d) => d.verification_status === 'verified',
      ).length,
      rejected: row.documents.filter(
        (d) => d.verification_status === 'rejected',
      ).length,
    };
    const document_status =
      document_summary.total === 0
        ? 'none'
        : document_summary.rejected > 0
          ? 'rejected'
          : document_summary.pending > 0
            ? 'pending'
            : 'verified';

    const tests = row.test_registrations;
    const test_status =
      tests.length === 0 ? null : tests[tests.length - 1].status;

    return {
      application_fee_status,
      document_status,
      document_summary,
      test_status,
      interview_status: row.interview?.status ?? null,
      offer_status: row.offer?.status ?? null,
    };
  }

  async findAll(instituteId: string, query: QueryApplicationDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, 'created_at');

    const statuses = query.status
      ? query.status
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const valid = Object.values(AdmissionApplicationStatus) as string[];
    const invalid = statuses.filter((s) => !valid.includes(s));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Unknown application status: ${invalid.join(', ')}`,
      );
    }

    const where: Prisma.AdmissionApplicationWhereInput = {
      institute_id: instituteId,
      deleted_at: null,
      session_id: query.session_id,
      program_id: query.program_id,
      applicant_id: query.applicant_id,
      ...(statuses.length > 0
        ? { status: { in: statuses as AdmissionApplicationStatus[] } }
        : {}),
      application_date: buildDateRange(query.from, query.to),
      ...(query.search
        ? {
            OR: [
              {
                application_number: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                applicant: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
              { applicant: { phone: { contains: query.search } } },
              {
                applicant: {
                  email: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.admissionApplication.findMany({
        where,
        orderBy: { [sortBy]: parseSortOrder(query.sortOrder) },
        skip,
        take,
        include: {
          applicant: {
            select: {
              applicant_id: true,
              name: true,
              phone: true,
              email: true,
            },
          },
          session: { select: { session_id: true, name: true } },
          program: { select: { program_id: true, name: true } },
          fee_payments: { select: { status: true } },
          documents: { select: { verification_status: true } },
          test_registrations: {
            select: { status: true },
            orderBy: { created_at: 'asc' },
          },
          interview: { select: { status: true } },
          offer: { select: { status: true, offer_expiry_date: true } },
        },
      }),
      this.prisma.admissionApplication.count({ where }),
    ]);

    const data = rows.map(
      ({
        fee_payments,
        documents,
        test_registrations,
        interview,
        offer,
        ...rest
      }) => ({
        ...rest,
        offer_expiry_date: offer?.offer_expiry_date ?? null,
        ...this.summarize({
          fee_payments,
          documents,
          test_registrations,
          interview,
          offer,
        }),
      }),
    );
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const application = await this.prisma.admissionApplication.findFirst({
      where: {
        application_id: id,
        institute_id: instituteId,
        deleted_at: null,
      },
      include: {
        applicant: true,
        session: true,
        program: true,
        source_enquiry: {
          select: {
            enquiry_id: true,
            name: true,
            source: true,
            status: true,
            created_at: true,
          },
        },
        documents: { orderBy: { uploaded_at: 'desc' } },
        fee_payments: { orderBy: { created_at: 'desc' } },
        test_registrations: {
          include: { test: true },
          orderBy: { created_at: 'asc' },
        },
        test_results: { orderBy: { created_at: 'asc' } },
        interview: {
          include: {
            panelists: true,
            evaluations: { orderBy: { created_at: 'asc' } },
          },
        },
        merit_entries: {
          include: {
            merit_list: {
              select: { merit_list_id: true, name: true, published_date: true },
            },
          },
        },
        offer: true,
        payments: { orderBy: { created_at: 'desc' } },
        confirmation: true,
      },
    });
    if (!application)
      throw new NotFoundException(`Application #${id} not found`);

    const [admission_fee, held] = await Promise.all([
      computeFeeSummary(this.prisma, application),
      this.seats.countHeld(
        this.prisma,
        application.program_id,
        application.session_id,
      ),
    ]);

    return {
      ...application,
      ...this.summarize({
        fee_payments: application.fee_payments,
        documents: application.documents,
        test_registrations: application.test_registrations,
        interview: application.interview,
        offer: application.offer,
      }),
      admission_fee,
      seat_availability: {
        total_seats: application.program.total_seats,
        held,
        available: Math.max(application.program.total_seats - held, 0),
      },
    };
  }

  /** Authoritative status plus the supporting child-stage picture — the status itself is never inferred from children. */
  async getStatus(instituteId: string, id: number) {
    const application = await this.findOne(instituteId, id);
    const applicant = application.applicant;
    const missing = COMPLETE_PROFILE_FIELDS.filter((f) => !applicant[f]);
    return {
      application_id: application.application_id,
      application_number: application.application_number,
      status: application.status,
      allowed_transitions: MANUAL_TRANSITIONS[application.status],
      supporting: {
        applicant_profile_complete: missing.length === 0,
        applicant_profile_missing: missing,
        application_fee_status: application.application_fee_status,
        document_status: application.document_status,
        document_summary: application.document_summary,
        test_status: application.test_status,
        interview_status: application.interview_status,
        offer_status: application.offer_status,
        admission_fee: application.admission_fee,
        confirmation_status: application.confirmation?.status ?? null,
      },
    };
  }

  async activity(instituteId: string, id: number) {
    await this.lookup.application(instituteId, id);
    return this.audit.getApplicationActivity(id);
  }

  // ─── Update / status / delete ─────────────────────────────────────────────

  async update(
    actor: AdmissionPlatformUser,
    id: number,
    dto: UpdateApplicationDto,
  ) {
    const existing = await this.lookup.application(actor.institute_id, id);
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BusinessException(
        'APPLICATION_NOT_EDITABLE',
        `An application in status "${existing.status}" can no longer be edited.`,
        { status: existing.status },
      );
    }

    const sessionId = dto.session_id ?? existing.session_id;
    const programId = dto.program_id ?? existing.program_id;
    const moved =
      sessionId !== existing.session_id || programId !== existing.program_id;
    if (moved) {
      const session = await this.lookup.session(actor.institute_id, sessionId);
      if (session.status === 'closed') {
        throw new BusinessException(
          'SESSION_CLOSED',
          'This academic session is closed.',
        );
      }
      await this.lookup.program(actor.institute_id, programId);
      const [registrations, interviews] = await Promise.all([
        this.prisma.admissionTestRegistration.count({
          where: { application_id: id },
        }),
        this.prisma.admissionInterview.count({ where: { application_id: id } }),
      ]);
      if (registrations + interviews > 0) {
        throw new BusinessException(
          'APPLICATION_HAS_ASSESSMENTS',
          'Program/session cannot change once the application is registered for a test or interview.',
        );
      }
    }

    let updated: AdmissionApplication;
    try {
      updated = await this.prisma.admissionApplication.update({
        where: { application_id: id },
        data: {
          session_id: dto.session_id,
          program_id: dto.program_id,
          application_date: dto.application_date
            ? new Date(dto.application_date)
            : undefined,
        },
      });
    } catch (err) {
      throw this.translateUniqueViolation(err);
    }
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.APPLICATION,
      entityId: String(id),
      action: 'update',
      metadata: { application_id: id, changed_fields: Object.keys(dto) },
    });
    return updated;
  }

  async changeStatus(
    actor: AdmissionPlatformUser,
    id: number,
    dto: ChangeApplicationStatusDto,
  ) {
    const application = await this.prisma.admissionApplication.findFirst({
      where: {
        application_id: id,
        institute_id: actor.institute_id,
        deleted_at: null,
      },
      include: { applicant: true, session: true },
    });
    if (!application)
      throw new NotFoundException(`Application #${id} not found`);

    const from = application.status;
    assertManualTransition(from, dto.status);

    if (REVIEW_TARGETS.includes(dto.status)) {
      await this.access.assertPermission(
        actor,
        'applications',
        'review',
        'You do not have permission to review applications.',
      );
    }
    if (REASON_REQUIRED.includes(dto.status) && !dto.reason?.trim()) {
      throw new BadRequestException(
        `A reason is required when setting status to "${dto.status}"`,
      );
    }

    if (dto.status === 'submitted') {
      const missing = COMPLETE_PROFILE_FIELDS.filter(
        (f) => !application.applicant[f],
      );
      if (missing.length > 0) {
        throw new BusinessException(
          'APPLICANT_PROFILE_INCOMPLETE',
          `Applicant details are incomplete: ${missing.join(', ')} required before submission.`,
          { missing },
        );
      }
      if (application.session.status === 'closed') {
        throw new BusinessException(
          'SESSION_CLOSED',
          'This academic session is closed.',
        );
      }
    }

    await this.prisma.$transaction((tx) =>
      moveApplicationStatusOrConflict(tx, id, [from], dto.status),
    );

    await this.audit.log(actor, {
      entityType: ADM_ENTITY.APPLICATION,
      entityId: String(id),
      action: 'status_change',
      oldStatus: from,
      newStatus: dto.status,
      reason: dto.reason,
      metadata: { application_id: id },
    });
    await this.notifications.queue({
      instituteId: actor.institute_id,
      entityType: ADM_ENTITY.APPLICATION,
      entityId: id,
      eventType:
        dto.status === 'submitted'
          ? 'application_submitted'
          : 'application_status_changed',
      recipient: application.applicant.email ?? application.applicant.phone,
      channel: application.applicant.email ? 'email' : 'sms',
      message: `Application ${application.application_number} is now ${dto.status.replace('_', ' ')}.`,
    });

    return this.findOne(actor.institute_id, id);
  }

  /** Soft delete — admission records are history. Only never-progressed or already-closed applications. */
  async remove(actor: AdmissionPlatformUser, id: number) {
    const application = await this.lookup.application(actor.institute_id, id);
    if (!DELETABLE_STATUSES.includes(application.status)) {
      throw new ConflictException(
        `An application in status "${application.status}" cannot be deleted. Cancel or reject it first.`,
      );
    }
    await this.prisma.admissionApplication.update({
      where: { application_id: id },
      data: { deleted_at: new Date() },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.APPLICATION,
      entityId: String(id),
      action: 'delete',
      oldStatus: application.status,
      metadata: { application_id: id },
    });
    return { deleted: true };
  }
}
