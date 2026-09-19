import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdmissionInterviewEvaluation, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { AdmissionAccessService } from '../common/admission-access.service';
import { AdmissionAuditService } from '../common/admission-audit.service';
import { AdmissionLookupService } from '../common/admission-lookup.service';
import { ADM_ENTITY } from '../common/admission-entities';
import { BusinessException } from '../common/business-exception';
import { ASSESSABLE_STATUSES } from '../common/application-state';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
  parseSort,
  parseSortOrder,
} from '../common/pagination.util';
import { AdmissionNotificationService } from '../notifications/admission-notification.service';
import {
  EvaluateInterviewDto,
  QueryInterviewDto,
  RescheduleInterviewDto,
  ScheduleInterviewDto,
  UpdateInterviewStatusDto,
} from './dto/interview.dto';

const SORT_FIELDS = ['scheduled_datetime', 'created_at'] as const;

interface ReadScope {
  /** false → the user may only see interviews they are a panelist on */
  all: boolean;
}

const INCLUDE_DETAIL = {
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
  panelists: true,
  evaluations: { orderBy: { created_at: 'asc' as const } },
} satisfies Prisma.AdmissionInterviewInclude;

@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AdmissionLookupService,
    private readonly access: AdmissionAccessService,
    private readonly audit: AdmissionAuditService,
    private readonly notifications: AdmissionNotificationService,
  ) {}

  /**
   * `interviews:read` sees everything; `interviews:read_assigned` alone sees
   * only interviews the user is on the panel of. Neither → 403.
   */
  private async readScope(actor: AdmissionPlatformUser): Promise<ReadScope> {
    if (await this.access.hasPermission(actor, 'interviews', 'read'))
      return { all: true };
    if (await this.access.hasPermission(actor, 'interviews', 'read_assigned'))
      return { all: false };
    throw new ForbiddenException(
      "Forbidden: your role lacks 'read' or 'read_assigned' permission on resource 'interviews'",
    );
  }

  private assertFuture(when: Date) {
    if (when.getTime() <= Date.now()) {
      throw new BusinessException(
        'INTERVIEW_IN_PAST',
        'The interview must be scheduled for a future date and time.',
      );
    }
  }

  private async assertPanel(
    instituteId: string,
    panelistIds: string[] | undefined,
  ) {
    for (const id of panelistIds ?? [])
      await this.lookup.staffMember(instituteId, id);
  }

  // ─── Schedule / reschedule / status ───────────────────────────────────────

  async schedule(actor: AdmissionPlatformUser, dto: ScheduleInterviewDto) {
    const when = new Date(dto.scheduled_datetime);
    this.assertFuture(when);
    await this.assertPanel(actor.institute_id, dto.panelist_ids);

    const interview = await this.prisma.$transaction(async (tx) => {
      const application = await this.lookup.lockApplication(
        actor.institute_id,
        dto.application_id,
        tx,
      );
      if (!ASSESSABLE_STATUSES.includes(application.status)) {
        throw new BusinessException(
          'APPLICATION_NOT_ELIGIBLE',
          `An interview cannot be scheduled for an application in status "${application.status}".`,
          { status: application.status },
        );
      }
      const existing = await tx.admissionInterview.findUnique({
        where: { application_id: dto.application_id },
      });
      if (existing) {
        throw new BusinessException(
          'INTERVIEW_ALREADY_SCHEDULED',
          'This application already has an interview. Reschedule it instead.',
          { interview_id: existing.interview_id },
          HttpStatus.CONFLICT,
        );
      }
      return tx.admissionInterview.create({
        data: {
          application_id: dto.application_id,
          scheduled_datetime: when,
          mode: dto.mode,
          venue_or_link: dto.venue_or_link,
          created_by: actor.eddva_user_id,
          panelists: {
            create: (dto.panelist_ids ?? []).map((evaluator_id) => ({
              evaluator_id,
            })),
          },
        },
        include: INCLUDE_DETAIL,
      });
    });

    await this.audit.log(actor, {
      entityType: ADM_ENTITY.INTERVIEW,
      entityId: String(interview.interview_id),
      action: 'schedule',
      newStatus: interview.status,
      metadata: {
        application_id: dto.application_id,
        scheduled_datetime: dto.scheduled_datetime,
        panelist_ids: dto.panelist_ids ?? [],
      },
    });
    const applicant = interview.application.applicant;
    await this.notifications.queue({
      instituteId: actor.institute_id,
      entityType: ADM_ENTITY.INTERVIEW,
      entityId: interview.interview_id,
      eventType: 'interview_scheduled',
      recipient: applicant.email ?? applicant.phone,
      channel: applicant.email ? 'email' : 'sms',
      message: `Interview for ${interview.application.application_number} on ${when.toISOString()} (${dto.mode}).`,
    });
    return interview;
  }

  async reschedule(
    actor: AdmissionPlatformUser,
    id: number,
    dto: RescheduleInterviewDto,
  ) {
    const existing = await this.lookup.interview(actor.institute_id, id);
    if (!['scheduled', 'rescheduled', 'no_show'].includes(existing.status)) {
      throw new BusinessException(
        'INTERVIEW_NOT_RESCHEDULABLE',
        `An interview that is "${existing.status}" cannot be rescheduled.`,
        { status: existing.status },
      );
    }
    const when = dto.scheduled_datetime
      ? new Date(dto.scheduled_datetime)
      : existing.scheduled_datetime;
    if (dto.scheduled_datetime) this.assertFuture(when);
    else if (existing.status === 'no_show') this.assertFuture(when); // a no-show needs a *new* future slot
    await this.assertPanel(actor.institute_id, dto.panelist_ids);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.admissionInterview.updateMany({
        where: { interview_id: id, status: existing.status },
        data: {
          status: 'rescheduled',
          scheduled_datetime: dto.scheduled_datetime ? when : undefined,
          mode: dto.mode,
          venue_or_link: dto.venue_or_link,
        },
      });
      if (result.count === 0) {
        throw new BusinessException(
          'INTERVIEW_STATUS_CONFLICT',
          'Another user has already changed this interview. Refresh and try again.',
          undefined,
          HttpStatus.CONFLICT,
        );
      }
      if (dto.panelist_ids) {
        await tx.admissionInterviewPanelist.deleteMany({
          where: { interview_id: id },
        });
        await tx.admissionInterviewPanelist.createMany({
          data: dto.panelist_ids.map((evaluator_id) => ({
            interview_id: id,
            evaluator_id,
          })),
        });
      }
      return tx.admissionInterview.findUniqueOrThrow({
        where: { interview_id: id },
        include: INCLUDE_DETAIL,
      });
    });

    await this.audit.log(actor, {
      entityType: ADM_ENTITY.INTERVIEW,
      entityId: String(id),
      action: 'reschedule',
      oldStatus: existing.status,
      newStatus: 'rescheduled',
      metadata: {
        application_id: existing.application_id,
        from: existing.scheduled_datetime,
        to: when,
      },
    });
    const applicant = updated.application.applicant;
    await this.notifications.queue({
      instituteId: actor.institute_id,
      entityType: ADM_ENTITY.INTERVIEW,
      entityId: id,
      eventType: 'interview_rescheduled',
      recipient: applicant.email ?? applicant.phone,
      channel: applicant.email ? 'email' : 'sms',
      message: `Interview for ${updated.application.application_number} moved to ${when.toISOString()}.`,
    });
    return updated;
  }

  async setStatus(
    actor: AdmissionPlatformUser,
    id: number,
    dto: UpdateInterviewStatusDto,
  ) {
    if (dto.status !== 'completed' && dto.status !== 'no_show') {
      throw new BusinessException(
        'INVALID_STATUS',
        'Status can only be set to completed or no_show; use reschedule to move it.',
      );
    }
    const existing = await this.lookup.interview(actor.institute_id, id);
    const result = await this.prisma.admissionInterview.updateMany({
      where: { interview_id: id, status: { in: ['scheduled', 'rescheduled'] } },
      data: { status: dto.status },
    });
    if (result.count === 0) {
      throw new BusinessException(
        'INVALID_STATUS_TRANSITION',
        `An interview that is "${existing.status}" cannot be marked ${dto.status}.`,
        { from: existing.status, to: dto.status },
        HttpStatus.CONFLICT,
      );
    }
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.INTERVIEW,
      entityId: String(id),
      action: 'status_change',
      oldStatus: existing.status,
      newStatus: dto.status,
      metadata: { application_id: existing.application_id },
    });
    return this.prisma.admissionInterview.findUniqueOrThrow({
      where: { interview_id: id },
      include: INCLUDE_DETAIL,
    });
  }

  // ─── Evaluation ───────────────────────────────────────────────────────────

  /**
   * One evaluation per evaluator per interview. When the interview has a panel,
   * only panel members may evaluate; with no panel, any holder of
   * `interviews:evaluate` may. Scores are audit-logged with evaluator + time.
   */
  async evaluate(
    actor: AdmissionPlatformUser,
    id: number,
    dto: EvaluateInterviewDto,
  ) {
    const interview = await this.prisma.admissionInterview.findFirst({
      where: {
        interview_id: id,
        application: { institute_id: actor.institute_id, deleted_at: null },
      },
      include: { panelists: true },
    });
    if (!interview) throw new NotFoundException(`Interview #${id} not found`);

    if (
      interview.panelists.length > 0 &&
      !interview.panelists.some((p) => p.evaluator_id === actor.eddva_user_id)
    ) {
      throw new ForbiddenException(
        'You are not on the evaluation panel for this interview.',
      );
    }
    if (interview.status === 'no_show') {
      throw new BusinessException(
        'INTERVIEW_NO_SHOW',
        'An interview marked no-show cannot be evaluated. Reschedule it first.',
      );
    }

    let evaluation: AdmissionInterviewEvaluation;
    try {
      evaluation = await this.prisma.$transaction(async (tx) => {
        const created = await tx.admissionInterviewEvaluation.create({
          data: {
            interview_id: id,
            evaluator_id: actor.eddva_user_id,
            evaluator_name: actor.user_name,
            score: new Prisma.Decimal(dto.score),
            remarks: dto.remarks,
            recommendation: dto.recommendation,
          },
        });
        await tx.admissionInterview.updateMany({
          where: {
            interview_id: id,
            status: { in: ['scheduled', 'rescheduled'] },
          },
          data: { status: 'completed' },
        });
        return created;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BusinessException(
          'EVALUATION_ALREADY_SUBMITTED',
          'You have already submitted an evaluation for this interview.',
          undefined,
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }

    await this.audit.log(actor, {
      entityType: ADM_ENTITY.INTERVIEW_EVALUATION,
      entityId: String(evaluation.evaluation_id),
      action: 'evaluate',
      metadata: {
        application_id: interview.application_id,
        interview_id: id,
        score: evaluation.score.toString(),
        recommendation: evaluation.recommendation,
      },
    });
    return evaluation;
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findAll(actor: AdmissionPlatformUser, query: QueryInterviewDto) {
    const scope = await this.readScope(actor);
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, 'scheduled_datetime');
    const onlyMine = !scope.all || query.mine;

    const where: Prisma.AdmissionInterviewWhereInput = {
      status: query.status,
      application_id: query.application_id,
      scheduled_datetime: buildDateRange(query.from, query.to),
      application: {
        institute_id: actor.institute_id,
        deleted_at: null,
        program_id: query.program_id,
        session_id: query.session_id,
      },
      ...(onlyMine
        ? { panelists: { some: { evaluator_id: actor.eddva_user_id } } }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.admissionInterview.findMany({
        where,
        include: INCLUDE_DETAIL,
        orderBy: { [sortBy]: parseSortOrder(query.sortOrder ?? 'asc') },
        skip,
        take,
      }),
      this.prisma.admissionInterview.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.redact(row, actor, scope)),
      pagination: buildMeta(total, page, limit),
    };
  }

  async findOne(actor: AdmissionPlatformUser, id: number) {
    const scope = await this.readScope(actor);
    const interview = await this.prisma.admissionInterview.findFirst({
      where: {
        interview_id: id,
        application: { institute_id: actor.institute_id, deleted_at: null },
      },
      include: INCLUDE_DETAIL,
    });
    if (!interview) throw new NotFoundException(`Interview #${id} not found`);
    if (
      !scope.all &&
      !interview.panelists.some((p) => p.evaluator_id === actor.eddva_user_id)
    ) {
      throw new ForbiddenException(
        'You can only view interviews you are assigned to.',
      );
    }
    return this.redact(interview, actor, scope);
  }

  /** An assigned-only evaluator sees only their own evaluation, so other panelists' scores cannot bias theirs. */
  private redact<T extends { evaluations: { evaluator_id: string }[] }>(
    interview: T,
    actor: AdmissionPlatformUser,
    scope: ReadScope,
  ): T {
    if (scope.all) return interview;
    return {
      ...interview,
      evaluations: interview.evaluations.filter(
        (e) => e.evaluator_id === actor.eddva_user_id,
      ),
    };
  }
}
