import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AdmissionApplicationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { AdmissionAuditService } from '../common/admission-audit.service';
import { AdmissionLookupService } from '../common/admission-lookup.service';
import { ADM_ENTITY } from '../common/admission-entities';
import { BusinessException } from '../common/business-exception';
import { MERIT_ELIGIBLE_STATUSES } from '../common/application-state';
import {
  buildMeta,
  parsePagination,
  parseSort,
  parseSortOrder,
} from '../common/pagination.util';
import { AdmissionNotificationService } from '../notifications/admission-notification.service';
import {
  CreateMeritListDto,
  MeritEntryDto,
  QueryMeritListDto,
  ReplaceMeritEntriesDto,
  UpdateMeritListDto,
} from './dto/merit-list.dto';

const SORT_FIELDS = ['created_at', 'published_date'] as const;

/** Statuses an application may be in for a published outcome to move it (see publish()). */
const SHORTLIST_FROM: AdmissionApplicationStatus[] = [
  'under_review',
  'test_scheduled',
  'waitlisted',
];
const WAITLIST_FROM: AdmissionApplicationStatus[] = [
  'under_review',
  'test_scheduled',
  'shortlisted',
];

@Injectable()
export class MeritListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AdmissionLookupService,
    private readonly audit: AdmissionAuditService,
    private readonly notifications: AdmissionNotificationService,
  ) {}

  private async assertDraft(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const list = await this.lookup.meritList(instituteId, id, tx);
    if (list.published_date) {
      throw new BusinessException(
        'MERIT_LIST_PUBLISHED',
        'A published merit list can no longer be changed.',
        { published_date: list.published_date },
        HttpStatus.CONFLICT,
      );
    }
    return list;
  }

  /** Entries must be unique by application and rank, and reference live applications of the list's program+session. */
  private async validateEntries(
    tx: Prisma.TransactionClient,
    instituteId: string,
    list: { program_id: number; session_id: number },
    entries: MeritEntryDto[],
  ) {
    const apps = new Set<number>();
    const ranks = new Set<number>();
    const problems: { application_id: number; reason: string }[] = [];
    for (const e of entries) {
      if (apps.has(e.application_id))
        problems.push({
          application_id: e.application_id,
          reason: 'DUPLICATE_APPLICATION',
        });
      if (ranks.has(e.rank))
        problems.push({
          application_id: e.application_id,
          reason: `DUPLICATE_RANK_${e.rank}`,
        });
      apps.add(e.application_id);
      ranks.add(e.rank);
    }

    const found = await tx.admissionApplication.findMany({
      where: {
        application_id: { in: [...apps] },
        institute_id: instituteId,
        deleted_at: null,
      },
      select: {
        application_id: true,
        program_id: true,
        session_id: true,
        status: true,
      },
    });
    const byId = new Map(found.map((a) => [a.application_id, a]));
    for (const id of apps) {
      const app = byId.get(id);
      if (!app) problems.push({ application_id: id, reason: 'NOT_FOUND' });
      else if (
        app.program_id !== list.program_id ||
        app.session_id !== list.session_id
      )
        problems.push({
          application_id: id,
          reason: 'PROGRAM_OR_SESSION_MISMATCH',
        });
      else if (!MERIT_ELIGIBLE_STATUSES.includes(app.status))
        problems.push({
          application_id: id,
          reason: `STATUS_${app.status.toUpperCase()}_NOT_ELIGIBLE`,
        });
    }
    if (problems.length > 0) {
      throw new BusinessException(
        'MERIT_ENTRIES_REJECTED',
        `${problems.length} merit entry problem(s). Nothing was saved.`,
        { problems },
      );
    }
  }

  async create(actor: AdmissionPlatformUser, dto: CreateMeritListDto) {
    await this.lookup.session(actor.institute_id, dto.session_id);
    await this.lookup.program(actor.institute_id, dto.program_id);

    const list = await this.prisma.$transaction(async (tx) => {
      if (dto.entries?.length)
        await this.validateEntries(tx, actor.institute_id, dto, dto.entries);
      return tx.admissionMeritList.create({
        data: {
          institute_id: actor.institute_id,
          name: dto.name,
          session_id: dto.session_id,
          program_id: dto.program_id,
          criteria_description: dto.criteria_description,
          created_by: actor.eddva_user_id,
          entries: { create: (dto.entries ?? []).map((e) => ({ ...e })) },
        },
        include: { entries: { orderBy: { rank: 'asc' } } },
      });
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.MERIT_LIST,
      entityId: String(list.merit_list_id),
      action: 'create',
      metadata: { entries: list.entries.length },
    });
    return list;
  }

  async findAll(instituteId: string, query: QueryMeritListDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, 'created_at');
    const where: Prisma.AdmissionMeritListWhereInput = {
      institute_id: instituteId,
      deleted_at: null,
      session_id: query.session_id,
      program_id: query.program_id,
      ...(query.published === undefined
        ? {}
        : { published_date: query.published ? { not: null } : null }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.admissionMeritList.findMany({
        where,
        orderBy: { [sortBy]: parseSortOrder(query.sortOrder) },
        skip,
        take,
        include: {
          session: { select: { session_id: true, name: true } },
          program: { select: { program_id: true, name: true } },
          _count: { select: { entries: true } },
        },
      }),
      this.prisma.admissionMeritList.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const list = await this.prisma.admissionMeritList.findFirst({
      where: { merit_list_id: id, institute_id: instituteId, deleted_at: null },
      include: {
        session: { select: { session_id: true, name: true } },
        program: {
          select: { program_id: true, name: true, total_seats: true },
        },
        entries: {
          orderBy: { rank: 'asc' },
          include: {
            application: {
              select: {
                application_id: true,
                application_number: true,
                status: true,
                applicant: { select: { applicant_id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!list) throw new NotFoundException(`Merit list #${id} not found`);
    return list;
  }

  async update(
    actor: AdmissionPlatformUser,
    id: number,
    dto: UpdateMeritListDto,
  ) {
    await this.assertDraft(actor.institute_id, id);
    const updated = await this.prisma.admissionMeritList.update({
      where: { merit_list_id: id },
      data: { name: dto.name, criteria_description: dto.criteria_description },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.MERIT_LIST,
      entityId: String(id),
      action: 'update',
      metadata: { changed_fields: Object.keys(dto) },
    });
    return updated;
  }

  async replaceEntries(
    actor: AdmissionPlatformUser,
    id: number,
    dto: ReplaceMeritEntriesDto,
  ) {
    const entries = await this.prisma.$transaction(async (tx) => {
      const list = await this.assertDraft(actor.institute_id, id, tx);
      await this.validateEntries(tx, actor.institute_id, list, dto.entries);
      await tx.admissionMeritListEntry.deleteMany({
        where: { merit_list_id: id },
      });
      await tx.admissionMeritListEntry.createMany({
        data: dto.entries.map((e) => ({ ...e, merit_list_id: id })),
      });
      return tx.admissionMeritListEntry.findMany({
        where: { merit_list_id: id },
        orderBy: { rank: 'asc' },
      });
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.MERIT_LIST,
      entityId: String(id),
      action: 'replace_entries',
      metadata: { entries: entries.length },
    });
    return entries;
  }

  /**
   * Publishes a draft list (irreversible). The published outcomes then drive the
   * authoritative application status:
   *   selected     → shortlisted
   *   waitlisted   → waitlisted
   *   not_selected → no automatic change (rejection is an explicit staff
   *                  decision with a reason; a candidate may still be picked
   *                  up by a later merit-list round)
   * Applications that have since moved on (rejected/offered/admitted/…) are
   * skipped and reported, never overwritten.
   */
  async publish(actor: AdmissionPlatformUser, id: number) {
    const result = await this.prisma.$transaction(async (tx) => {
      const list = await this.assertDraft(actor.institute_id, id, tx);
      const entries = await tx.admissionMeritListEntry.findMany({
        where: { merit_list_id: id },
        include: {
          application: {
            select: {
              application_id: true,
              application_number: true,
              status: true,
              applicant: { select: { email: true, phone: true } },
            },
          },
        },
      });
      if (entries.length === 0) {
        throw new BusinessException(
          'MERIT_LIST_EMPTY',
          'A merit list must have at least one entry before it can be published.',
        );
      }

      const claimed = await tx.admissionMeritList.updateMany({
        where: { merit_list_id: id, published_date: null },
        data: { published_date: new Date(), published_by: actor.eddva_user_id },
      });
      if (claimed.count === 0) {
        throw new BusinessException(
          'MERIT_LIST_PUBLISHED',
          'This merit list was published by another user.',
          undefined,
          HttpStatus.CONFLICT,
        );
      }

      const moved: {
        application_id: number;
        application_number: string;
        from: string;
        to: string;
        contact: string;
      }[] = [];
      const skipped: { application_id: number; status: string }[] = [];
      for (const entry of entries) {
        const target =
          entry.outcome === 'selected'
            ? 'shortlisted'
            : entry.outcome === 'waitlisted'
              ? 'waitlisted'
              : null;
        if (!target) continue;
        const app = entry.application;
        const from = target === 'shortlisted' ? SHORTLIST_FROM : WAITLIST_FROM;
        if (app.status === target) continue;
        const res = await tx.admissionApplication.updateMany({
          where: { application_id: app.application_id, status: { in: from } },
          data: { status: target },
        });
        if (res.count > 0) {
          moved.push({
            application_id: app.application_id,
            application_number: app.application_number,
            from: app.status,
            to: target,
            contact: app.applicant.email ?? app.applicant.phone,
          });
        } else {
          skipped.push({
            application_id: app.application_id,
            status: app.status,
          });
        }
      }
      return { list, moved, skipped, entryCount: entries.length };
    });

    await this.audit.log(actor, {
      entityType: ADM_ENTITY.MERIT_LIST,
      entityId: String(id),
      action: 'publish',
      newStatus: 'published',
      metadata: {
        entries: result.entryCount,
        applications_moved: result.moved.length,
        applications_skipped: result.skipped.length,
      },
    });
    for (const m of result.moved) {
      await this.audit.log(actor, {
        entityType: ADM_ENTITY.APPLICATION,
        entityId: String(m.application_id),
        action: 'status_change',
        oldStatus: m.from,
        newStatus: m.to,
        reason: `Merit list #${id} published`,
        metadata: { application_id: m.application_id, merit_list_id: id },
      });
    }
    await this.notifications.queueMany(
      result.moved.map((m) => ({
        instituteId: actor.institute_id,
        entityType: ADM_ENTITY.APPLICATION,
        entityId: m.application_id,
        eventType: 'application_status_changed',
        recipient: m.contact,
        channel: m.contact.includes('@')
          ? ('email' as const)
          : ('sms' as const),
        message: `Application ${m.application_number} is now ${m.to}.`,
      })),
    );

    return {
      merit_list: await this.findOne(actor.institute_id, id),
      applications_moved: result.moved.map((m) => ({
        application_id: m.application_id,
        application_number: m.application_number,
        from: m.from,
        to: m.to,
      })),
      applications_skipped: result.skipped,
    };
  }
}
