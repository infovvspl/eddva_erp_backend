import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlumniJob, AlumniJobApplication, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { isAlumniPrincipal } from '../common/alumni-access.service';
import { AlumniAuditService } from '../common/alumni-audit.service';
import { ALUMNI_ENTITY } from '../common/alumni-entities';
import {
  AlumniFileStorageService,
  RESUME_RULES,
} from '../common/alumni-file-storage.service';
import { AlumniLookupService } from '../common/alumni-lookup.service';
import { ALUMNI_SUMMARY_SELECT } from '../common/alumni-profile.view';
import {
  APPLICATION_TRANSITIONS,
  OPEN_APPLICATION_STATUSES,
  assertTransition,
} from '../common/alumni-state';
import { BusinessException } from '../common/business-exception';
import { buildMeta, parsePagination } from '../common/pagination.util';
import { AlumniNotificationService } from '../notifications/alumni-notification.service';
import {
  ApplyJobDto,
  QueryApplicationDto,
  UpdateApplicationStatusDto,
} from './dto/job.dto';
import { effectiveJobStatus } from './jobs.service';

const JOB_BRIEF = {
  job_id: true,
  title: true,
  company: true,
  location: true,
  job_type: true,
  status: true,
  expiry_date: true,
  posted_by_alumni_id: true,
} satisfies Prisma.AlumniJobSelect;

/** Applying is consent to be contacted, so the poster and staff get e-mail and phone. */
const APPLICANT_SELECT = {
  ...ALUMNI_SUMMARY_SELECT,
  email: true,
  phone: true,
  linkedin_url: true,
} satisfies Prisma.AlumniProfileSelect;

type ApplicationRow = AlumniJobApplication;

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AlumniLookupService,
    private readonly audit: AlumniAuditService,
    private readonly notifications: AlumniNotificationService,
    private readonly files: AlumniFileStorageService,
  ) {}

  /** Internal storage columns never leave the server. */
  private present<T extends ApplicationRow>(row: T) {
    const { resume_path, resume_mime, ...rest } = row;
    return {
      ...rest,
      has_resume_file: Boolean(resume_path && resume_mime),
    };
  }

  private isPoster(
    actor: AlumniPlatformUser,
    job: Pick<AlumniJob, 'posted_by_alumni_id'>,
  ) {
    return (
      isAlumniPrincipal(actor) && job.posted_by_alumni_id === actor.alumni_id
    );
  }

  /** Who may see an application: its applicant, the job's poster, or staff. */
  private assertCanView(
    actor: AlumniPlatformUser,
    app: ApplicationRow,
    job: Pick<AlumniJob, 'posted_by_alumni_id'>,
  ) {
    if (!isAlumniPrincipal(actor)) return;
    if (
      app.applicant_alumni_id === actor.alumni_id ||
      this.isPoster(actor, job)
    )
      return;
    throw new NotFoundException(
      `Job application #${app.application_id} not found`,
    );
  }

  // ─── Apply / withdraw ────────────────────────────────────────────────────

  async apply(actor: AlumniPlatformUser, jobId: number, dto: ApplyJobDto) {
    let applicantId: number;
    if (isAlumniPrincipal(actor)) {
      if (dto.alumni_id !== undefined && dto.alumni_id !== actor.alumni_id) {
        throw new ForbiddenException('You can only apply as yourself');
      }
      if (!actor.alumni_verified) {
        throw new ForbiddenException(
          'Your alumni profile must be verified before you can apply for jobs',
        );
      }
      applicantId = actor.alumni_id as number;
    } else {
      if (dto.alumni_id === undefined) {
        throw new BusinessException(
          'ALUMNI_ID_REQUIRED',
          'alumni_id is required when applying on behalf of an alumnus',
          undefined,
          400,
        );
      }
      applicantId = dto.alumni_id;
    }
    await this.lookup.job(actor.institute_id, jobId);
    const applicant = await this.lookup.profile(
      actor.institute_id,
      applicantId,
    );
    if (!applicant.is_active) {
      throw new BusinessException(
        'ALUMNI_INACTIVE',
        'This alumni profile is deactivated',
      );
    }

    const { application, job } = await this.prisma.$transaction(async (tx) => {
      // Lock the posting so closing / expiring it cannot interleave with an application.
      await this.lookup.lock(tx, 'job', actor.institute_id, jobId);
      const locked = await this.lookup.job(actor.institute_id, jobId, tx);
      const effective = effectiveJobStatus(locked);
      if (effective !== 'open') {
        throw new BusinessException(
          effective === 'expired' ? 'JOB_EXPIRED' : 'JOB_CLOSED',
          effective === 'expired'
            ? 'This job posting has expired'
            : 'This job posting is closed',
          { status: effective },
        );
      }
      if (locked.posted_by_alumni_id === applicantId) {
        throw new BusinessException(
          'OWN_JOB',
          'You cannot apply to your own job posting',
        );
      }
      const existing = await tx.alumniJobApplication.findUnique({
        where: {
          job_id_applicant_alumni_id: {
            job_id: jobId,
            applicant_alumni_id: applicantId,
          },
        },
      });
      if (existing && existing.status !== 'withdrawn') {
        throw new BusinessException(
          'ALREADY_APPLIED',
          'This alumnus has already applied to this job',
          { application_id: existing.application_id, status: existing.status },
          409,
        );
      }
      const data = {
        status: 'applied' as const,
        applied_at: new Date(),
        resume_url: dto.resume_url ?? existing?.resume_url ?? null,
        cover_note: dto.cover_note ?? null,
        status_note: null,
        status_updated_at: null,
        status_updated_by: null,
      };
      const row = existing
        ? // A withdrawn application is re-opened rather than duplicated (one per job + alumnus).
          await tx.alumniJobApplication.update({
            where: { application_id: existing.application_id },
            data,
          })
        : await tx.alumniJobApplication.create({
            data: {
              ...data,
              institute_id: actor.institute_id,
              job_id: jobId,
              applicant_alumni_id: applicantId,
            },
          });
      return { application: row, job: locked };
    });

    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.APPLICATION,
      entityId: String(application.application_id),
      action: 'apply',
      newStatus: 'applied',
      metadata: { job_id: jobId, applicant_alumni_id: applicantId },
    });
    const event = {
      instituteId: actor.institute_id,
      entityType: ALUMNI_ENTITY.APPLICATION,
      entityId: application.application_id,
      eventType: 'job_application_received',
      message: `${applicant.full_name} applied for "${job.title}".`,
    };
    if (job.posted_by_alumni_id) {
      const poster = await this.prisma.alumniProfile.findUnique({
        where: { alumni_id: job.posted_by_alumni_id },
        select: { email: true },
      });
      await this.notifications.notifyAlumni(event, {
        alumni_id: job.posted_by_alumni_id,
        email: poster?.email,
      });
    } else {
      await this.notifications.notifyStaff(event);
    }
    return this.present(application);
  }

  async withdraw(actor: AlumniPlatformUser, id: number) {
    const app = await this.lookup.application(actor.institute_id, id);
    if (
      isAlumniPrincipal(actor) &&
      app.applicant_alumni_id !== actor.alumni_id
    ) {
      throw new NotFoundException(`Job application #${id} not found`);
    }
    assertTransition(
      APPLICATION_TRANSITIONS,
      app.status,
      'withdrawn',
      'The application',
    );
    const { count } = await this.prisma.alumniJobApplication.updateMany({
      where: {
        application_id: id,
        status: { in: [...OPEN_APPLICATION_STATUSES] },
      },
      data: {
        status: 'withdrawn',
        status_updated_at: new Date(),
        status_updated_by: actor.eddva_user_id,
      },
    });
    if (count === 0) {
      throw new BusinessException(
        'APPLICATION_CHANGED',
        'The application was updated meanwhile; refresh and retry',
        undefined,
        409,
      );
    }
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.APPLICATION,
      entityId: String(id),
      action: 'withdraw',
      oldStatus: app.status,
      newStatus: 'withdrawn',
    });
    return this.present(await this.lookup.application(actor.institute_id, id));
  }

  // ─── Review ──────────────────────────────────────────────────────────────

  /** Job poster or staff moves an application forward; transitions are validated and compare-and-set. */
  async updateStatus(
    actor: AlumniPlatformUser,
    id: number,
    dto: UpdateApplicationStatusDto,
  ) {
    const app = await this.lookup.application(actor.institute_id, id);
    if (isAlumniPrincipal(actor) && !this.isPoster(actor, app.job)) {
      throw new ForbiddenException(
        'Only the job poster or alumni-office staff can update an application',
      );
    }
    assertTransition(
      APPLICATION_TRANSITIONS,
      app.status,
      dto.status,
      'The application',
    );

    const { count } = await this.prisma.alumniJobApplication.updateMany({
      where: { application_id: id, status: app.status },
      data: {
        status: dto.status,
        status_note: dto.note,
        status_updated_at: new Date(),
        status_updated_by: actor.eddva_user_id,
      },
    });
    if (count === 0) {
      throw new BusinessException(
        'APPLICATION_CHANGED',
        'The application was updated meanwhile; refresh and retry',
        undefined,
        409,
      );
    }
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.APPLICATION,
      entityId: String(id),
      action: 'status_change',
      oldStatus: app.status,
      newStatus: dto.status,
      reason: dto.note,
      metadata: { job_id: app.job_id },
    });
    const applicant = await this.prisma.alumniProfile.findUnique({
      where: { alumni_id: app.applicant_alumni_id },
      select: { email: true },
    });
    await this.notifications.notifyAlumni(
      {
        instituteId: actor.institute_id,
        entityType: ALUMNI_ENTITY.APPLICATION,
        entityId: id,
        eventType: 'application_status_changed',
        message: `Your application for "${app.job.title}" is now ${dto.status}.`,
      },
      { alumni_id: app.applicant_alumni_id, email: applicant?.email },
    );
    return this.present(await this.lookup.application(actor.institute_id, id));
  }

  /** Applications of one job — the poster or staff. */
  async listForJob(
    actor: AlumniPlatformUser,
    jobId: number,
    query: QueryApplicationDto,
  ) {
    const job = await this.lookup.job(actor.institute_id, jobId);
    if (
      isAlumniPrincipal(actor) &&
      job.posted_by_alumni_id !== actor.alumni_id
    ) {
      throw new ForbiddenException(
        'Only the job poster can see its applications',
      );
    }
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.AlumniJobApplicationWhereInput = {
      job_id: jobId,
      institute_id: actor.institute_id,
      status: query.status,
      ...(query.search
        ? {
            applicant: {
              full_name: { contains: query.search.trim(), mode: 'insensitive' },
            },
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.alumniJobApplication.findMany({
        where,
        orderBy: [{ applied_at: 'desc' }, { application_id: 'desc' }],
        skip,
        take,
        include: { applicant: { select: APPLICANT_SELECT } },
      }),
      this.prisma.alumniJobApplication.count({ where }),
    ]);
    return {
      data: rows.map((r) => this.present(r)),
      pagination: buildMeta(total, page, limit),
    };
  }

  /** Alumni: their own application history. Staff: any, filterable. */
  async findAll(actor: AlumniPlatformUser, query: QueryApplicationDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.AlumniJobApplicationWhereInput = {
      institute_id: actor.institute_id,
      status: query.status,
      job_id: query.job_id,
      applicant_alumni_id: isAlumniPrincipal(actor)
        ? actor.alumni_id
        : query.applicant_alumni_id,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.alumniJobApplication.findMany({
        where,
        orderBy: [{ applied_at: 'desc' }, { application_id: 'desc' }],
        skip,
        take,
        include: { job: { select: JOB_BRIEF } },
      }),
      this.prisma.alumniJobApplication.count({ where }),
    ]);
    return {
      data: rows.map((r) => this.present(r)),
      pagination: buildMeta(total, page, limit),
    };
  }

  async findOne(actor: AlumniPlatformUser, id: number) {
    const app = await this.lookup.application(actor.institute_id, id);
    this.assertCanView(actor, app, app.job);
    const { job, ...rest } = app;
    const applicant = await this.prisma.alumniProfile.findUnique({
      where: { alumni_id: app.applicant_alumni_id },
      select: APPLICANT_SELECT,
    });
    return {
      ...this.present(rest),
      job: { ...job, effective_status: effectiveJobStatus(job) },
      applicant,
    };
  }

  /** Status history of one application, from the audit trail. */
  async history(actor: AlumniPlatformUser, id: number) {
    const app = await this.lookup.application(actor.institute_id, id);
    this.assertCanView(actor, app, app.job);
    return this.audit.trail(ALUMNI_ENTITY.APPLICATION, id);
  }

  // ─── Resume file ─────────────────────────────────────────────────────────

  async uploadResume(
    actor: AlumniPlatformUser,
    id: number,
    file: Express.Multer.File | undefined,
  ) {
    const app = await this.lookup.application(actor.institute_id, id);
    if (
      isAlumniPrincipal(actor) &&
      app.applicant_alumni_id !== actor.alumni_id
    ) {
      throw new NotFoundException(`Job application #${id} not found`);
    }
    if (!OPEN_APPLICATION_STATUSES.includes(app.status)) {
      throw new BusinessException(
        'APPLICATION_CLOSED',
        `A resume cannot be attached to an application in status "${app.status}"`,
      );
    }
    const stored = await this.files.save(
      actor.institute_id,
      'resumes',
      file,
      RESUME_RULES,
    );
    try {
      await this.prisma.alumniJobApplication.update({
        where: { application_id: id },
        data: { resume_path: stored.path, resume_mime: stored.mime },
      });
    } catch (err) {
      await this.files.remove(stored.path);
      throw err;
    }
    await this.files.remove(app.resume_path);
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.APPLICATION,
      entityId: String(id),
      action: 'resume_upload',
    });
    return { application_id: id, has_resume_file: true };
  }

  /** Resume access: the applicant, the poster of that job, or staff — nobody else. */
  async resumeForDownload(actor: AlumniPlatformUser, id: number) {
    const app = await this.lookup.application(actor.institute_id, id);
    this.assertCanView(actor, app, app.job);
    if (
      !app.resume_path ||
      !app.resume_mime ||
      !(await this.files.exists(app.resume_path))
    ) {
      throw new NotFoundException(
        'No resume file was uploaded for this application',
      );
    }
    return {
      absolutePath: this.files.resolve(app.resume_path),
      mime: app.resume_mime,
    };
  }
}
