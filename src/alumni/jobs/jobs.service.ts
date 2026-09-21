import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlumniJob, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { isAlumniPrincipal } from '../common/alumni-access.service';
import { AlumniAuditService } from '../common/alumni-audit.service';
import { ALUMNI_ENTITY } from '../common/alumni-entities';
import { AlumniLookupService } from '../common/alumni-lookup.service';
import { BusinessException } from '../common/business-exception';
import {
  buildMeta,
  parsePagination,
  parseSort,
  parseSortOrder,
} from '../common/pagination.util';
import { sqlNowUtc } from '../common/sql-time';
import { parseDateTime } from '../common/time.util';
import { AlumniNotificationService } from '../notifications/alumni-notification.service';
import { CreateJobDto, QueryJobDto, UpdateJobDto } from './dto/job.dto';

const SORT_FIELDS = [
  'posted_date',
  'expiry_date',
  'title',
  'company',
  'created_at',
] as const;

/** The status a posting really has now — `open` past its expiry date is already `expired`. */
export function effectiveJobStatus(
  job: Pick<AlumniJob, 'status' | 'expiry_date'>,
  now: Date = new Date(),
): AlumniJob['status'] {
  if (job.status === 'open' && job.expiry_date && job.expiry_date <= now) {
    return 'expired';
  }
  return job.status;
}

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AlumniLookupService,
    private readonly audit: AlumniAuditService,
    private readonly notifications: AlumniNotificationService,
  ) {}

  private present(job: AlumniJob) {
    return { ...job, effective_status: effectiveJobStatus(job) };
  }

  /** Poster (alumni) or staff; anyone else is refused. */
  private assertCanManage(actor: AlumniPlatformUser, job: AlumniJob) {
    if (
      isAlumniPrincipal(actor) &&
      job.posted_by_alumni_id !== actor.alumni_id
    ) {
      throw new ForbiddenException('You can only manage your own job postings');
    }
  }

  private parseExpiry(value: string | undefined): Date | undefined {
    if (value === undefined) return undefined;
    const expiry = parseDateTime(value, 'expiry_date');
    if (expiry.getTime() <= Date.now()) {
      throw new BusinessException(
        'INVALID_EXPIRY',
        'expiry_date must be in the future',
      );
    }
    return expiry;
  }

  async create(actor: AlumniPlatformUser, dto: CreateJobDto) {
    let postedByAlumni: number | null = null;
    if (isAlumniPrincipal(actor)) {
      // Verification is the gate for posting: unverified alumni can browse but not post.
      if (!actor.alumni_verified) {
        throw new ForbiddenException(
          'Your alumni profile must be verified before you can post jobs',
        );
      }
      if (
        dto.posted_by_alumni_id !== undefined &&
        dto.posted_by_alumni_id !== actor.alumni_id
      ) {
        throw new ForbiddenException('You can only post jobs as yourself');
      }
      postedByAlumni = actor.alumni_id as number;
    } else if (dto.posted_by_alumni_id !== undefined) {
      const poster = await this.lookup.profile(
        actor.institute_id,
        dto.posted_by_alumni_id,
      );
      if (!poster.is_active) {
        throw new BusinessException(
          'ALUMNI_INACTIVE',
          'This alumni profile is deactivated',
        );
      }
      postedByAlumni = poster.alumni_id;
    }
    const expiry = this.parseExpiry(dto.expiry_date);

    const job = await this.prisma.alumniJob.create({
      data: {
        institute_id: actor.institute_id,
        posted_by_alumni_id: postedByAlumni,
        posted_by_user_id: actor.eddva_user_id,
        title: dto.title,
        company: dto.company,
        description: dto.description,
        location: dto.location,
        job_type: dto.job_type,
        industry: dto.industry,
        expiry_date: expiry,
      },
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.JOB,
      entityId: String(job.job_id),
      action: 'create',
      newStatus: job.status,
      metadata: { posted_by_alumni_id: postedByAlumni },
    });
    return this.present(job);
  }

  async findAll(actor: AlumniPlatformUser, query: QueryJobDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, 'posted_date');
    const order = parseSortOrder(query.sortOrder);
    const now = new Date();
    const contains = (v: string) => ({
      contains: v,
      mode: 'insensitive' as const,
    });

    const and: Prisma.AlumniJobWhereInput[] = [];
    if (query.search) {
      const term = query.search.trim();
      and.push({
        OR: [
          { title: contains(term) },
          { company: contains(term) },
          { description: contains(term) },
        ],
      });
    }
    if (query.status === 'open') {
      and.push({
        status: 'open',
        OR: [{ expiry_date: null }, { expiry_date: { gt: now } }],
      });
    } else if (query.status === 'expired') {
      and.push({
        OR: [
          { status: 'expired' },
          { status: 'open', expiry_date: { lte: now } },
        ],
      });
    } else if (query.status === 'closed') {
      and.push({ status: 'closed' });
    }
    if (isAlumniPrincipal(actor)) {
      // Alumni browse open postings, plus everything they posted themselves.
      and.push({
        OR: [
          {
            status: 'open',
            AND: [
              { OR: [{ expiry_date: null }, { expiry_date: { gt: now } }] },
            ],
          },
          { posted_by_alumni_id: actor.alumni_id },
        ],
      });
      if (query.mine) and.push({ posted_by_alumni_id: actor.alumni_id });
    }

    const where: Prisma.AlumniJobWhereInput = {
      institute_id: actor.institute_id,
      job_type: query.job_type,
      posted_by_alumni_id: isAlumniPrincipal(actor)
        ? undefined
        : query.posted_by_alumni_id,
      ...(query.location ? { location: contains(query.location) } : {}),
      ...(query.company ? { company: contains(query.company) } : {}),
      ...(query.industry ? { industry: contains(query.industry) } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.alumniJob.findMany({
        where,
        orderBy: [{ [sortBy]: order }, { job_id: 'desc' }],
        skip,
        take,
        include: { _count: { select: { applications: true } } },
      }),
      this.prisma.alumniJob.count({ where }),
    ]);
    return {
      data: rows.map(({ _count, ...job }) => ({
        ...this.present(job),
        // Applicant counts are for the poster and staff, not for other alumni.
        ...(!isAlumniPrincipal(actor) ||
        job.posted_by_alumni_id === actor.alumni_id
          ? { application_count: _count.applications }
          : {}),
      })),
      pagination: buildMeta(total, page, limit),
    };
  }

  async findOne(actor: AlumniPlatformUser, id: number) {
    const job = await this.lookup.job(actor.institute_id, id);
    if (
      isAlumniPrincipal(actor) &&
      job.posted_by_alumni_id !== actor.alumni_id &&
      effectiveJobStatus(job) !== 'open'
    ) {
      throw new NotFoundException(`Job #${id} not found`);
    }
    return this.present(job);
  }

  async update(actor: AlumniPlatformUser, id: number, dto: UpdateJobDto) {
    const job = await this.lookup.job(actor.institute_id, id);
    this.assertCanManage(actor, job);
    if (job.status === 'closed') {
      throw new BusinessException(
        'JOB_CLOSED',
        'A closed job posting cannot be edited',
      );
    }
    const expiry = this.parseExpiry(dto.expiry_date);
    const updated = await this.prisma.alumniJob.update({
      where: { job_id: id },
      data: {
        title: dto.title,
        company: dto.company,
        description: dto.description,
        location: dto.location,
        job_type: dto.job_type,
        industry: dto.industry,
        expiry_date: expiry,
        // A new future expiry date re-opens a posting that had expired.
        ...(expiry && job.status === 'expired'
          ? { status: 'open' as const }
          : {}),
      },
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.JOB,
      entityId: String(id),
      action: 'update',
      oldStatus: job.status,
      newStatus: updated.status,
      metadata: { fields: Object.keys(dto) },
    });
    return this.present(updated);
  }

  async close(actor: AlumniPlatformUser, id: number) {
    const job = await this.lookup.job(actor.institute_id, id);
    this.assertCanManage(actor, job);
    const { count } = await this.prisma.alumniJob.updateMany({
      where: { job_id: id, status: { in: ['open', 'expired'] } },
      data: { status: 'closed', closed_at: new Date() },
    });
    if (count === 0) {
      throw new BusinessException(
        'JOB_ALREADY_CLOSED',
        'This job posting is already closed',
        undefined,
        409,
      );
    }
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.JOB,
      entityId: String(id),
      action: 'close',
      oldStatus: job.status,
      newStatus: 'closed',
    });
    return this.present(await this.lookup.job(actor.institute_id, id));
  }

  /** A posting nobody applied to can be deleted; otherwise close it (applications are history). */
  async remove(actor: AlumniPlatformUser, id: number) {
    const job = await this.lookup.job(actor.institute_id, id);
    this.assertCanManage(actor, job);
    const applications = await this.prisma.alumniJobApplication.count({
      where: { job_id: id },
    });
    if (applications > 0) {
      throw new BusinessException(
        'JOB_HAS_APPLICATIONS',
        'This posting has applications; close it instead of deleting it',
        { applications },
        409,
      );
    }
    await this.prisma.alumniJob.delete({ where: { job_id: id } });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.JOB,
      entityId: String(id),
      action: 'delete',
    });
    return { job_id: id, deleted: true };
  }

  /**
   * open → expired for postings past their expiry date, and one "job expired"
   * notice per posting to its poster. The UPDATE … RETURNING claims each posting
   * exactly once. Applying never depends on this having run: `ApplicationsService`
   * checks the expiry date itself.
   */
  async expireJobs(): Promise<number> {
    const expired = await this.prisma.$queryRaw<
      Array<{
        job_id: number;
        institute_id: string;
        title: string;
        posted_by_alumni_id: number | null;
      }>
    >`
      UPDATE "alumni_jobs"
      SET "status" = 'expired', "updated_at" = ${sqlNowUtc}
      WHERE "job_id" IN (
        SELECT "job_id" FROM "alumni_jobs"
        WHERE "status" = 'open' AND "expiry_date" IS NOT NULL AND "expiry_date" <= ${sqlNowUtc}
        FOR UPDATE SKIP LOCKED)
      RETURNING "job_id", "institute_id", "title", "posted_by_alumni_id"`;
    if (expired.length === 0) return 0;

    const posterIds = [
      ...new Set(
        expired.flatMap((j) =>
          j.posted_by_alumni_id ? [j.posted_by_alumni_id] : [],
        ),
      ),
    ];
    const posters = await this.prisma.alumniProfile.findMany({
      where: { alumni_id: { in: posterIds } },
      select: { alumni_id: true, email: true },
    });
    const emailOf = new Map(posters.map((p) => [p.alumni_id, p.email]));

    for (const job of expired) {
      const event = {
        instituteId: job.institute_id,
        entityType: ALUMNI_ENTITY.JOB,
        entityId: job.job_id,
        eventType: 'job_expired',
        message: `Your job posting "${job.title}" has expired and no longer accepts applications.`,
      };
      if (job.posted_by_alumni_id) {
        await this.notifications.notifyAlumni(event, {
          alumni_id: job.posted_by_alumni_id,
          email: emailOf.get(job.posted_by_alumni_id),
        });
      } else {
        await this.notifications.notifyStaff({
          ...event,
          message: `Job posting "${job.title}" has expired.`,
        });
      }
    }
    return expired.length;
  }
}
