import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlumniMentorProfile, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { isAlumniPrincipal } from '../common/alumni-access.service';
import { AlumniAuditService } from '../common/alumni-audit.service';
import { ALUMNI_ENTITY } from '../common/alumni-entities';
import { AlumniLookupService } from '../common/alumni-lookup.service';
import {
  ALUMNI_CONTACT_SELECT,
  summaryFor,
  viewerOf,
} from '../common/alumni-profile.view';
import { BusinessException } from '../common/business-exception';
import { buildMeta, parsePagination } from '../common/pagination.util';
import { isUniqueViolation } from '../common/unique-violation.util';
import { AlumniNotificationService } from '../notifications/alumni-notification.service';
import {
  CreateMentorDto,
  QueryMentorDto,
  UpdateMentorDto,
} from './dto/mentorship.dto';

/** Trim, lower-case and de-duplicate expertise tags so they can be matched exactly. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const tag of tags) {
    const t = tag.trim().toLowerCase().replace(/\s+/g, ' ');
    if (t) seen.add(t);
  }
  return [...seen];
}

/**
 * Recomputes available ↔ fully_booked from the live count of active matches.
 * `inactive` is a deliberate choice by the mentor/staff and is never overridden.
 * Must run inside the transaction that changed the matches (mentor row locked).
 */
export async function syncMentorStatus(
  tx: Prisma.TransactionClient,
  mentorId: number,
): Promise<AlumniMentorProfile> {
  const mentor = await tx.alumniMentorProfile.findUniqueOrThrow({
    where: { mentor_id: mentorId },
  });
  if (mentor.status === 'inactive') return mentor;
  const active = await tx.alumniMentorshipMatch.count({
    where: { mentor_id: mentorId, status: 'active' },
  });
  const status = active >= mentor.max_mentees ? 'fully_booked' : 'available';
  if (status === mentor.status) return mentor;
  return tx.alumniMentorProfile.update({
    where: { mentor_id: mentorId },
    data: { status },
  });
}

@Injectable()
export class MentorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AlumniLookupService,
    private readonly audit: AlumniAuditService,
    private readonly notifications: AlumniNotificationService,
  ) {}

  private assertCanManage(
    actor: AlumniPlatformUser,
    mentor: AlumniMentorProfile,
  ) {
    if (isAlumniPrincipal(actor) && mentor.alumni_id !== actor.alumni_id) {
      throw new ForbiddenException(
        'You can only manage your own mentor profile',
      );
    }
  }

  /** "Become a mentor" (alumni, verified) or enrol an alumnus (staff). */
  async create(actor: AlumniPlatformUser, dto: CreateMentorDto) {
    let alumniId: number;
    if (isAlumniPrincipal(actor)) {
      if (dto.alumni_id !== undefined && dto.alumni_id !== actor.alumni_id) {
        throw new ForbiddenException(
          'You can only create your own mentor profile',
        );
      }
      if (!actor.alumni_verified) {
        throw new ForbiddenException(
          'Your alumni profile must be verified before you can become a mentor',
        );
      }
      alumniId = actor.alumni_id as number;
    } else {
      if (dto.alumni_id === undefined) {
        throw new BusinessException(
          'ALUMNI_ID_REQUIRED',
          'alumni_id is required when enrolling an alumnus as a mentor',
          undefined,
          400,
        );
      }
      alumniId = dto.alumni_id;
    }
    const profile = await this.lookup.profile(actor.institute_id, alumniId);
    if (!profile.is_active) {
      throw new BusinessException(
        'ALUMNI_INACTIVE',
        'This alumni profile is deactivated',
      );
    }
    const expertise = normalizeTags(dto.expertise_areas);
    if (expertise.length === 0) {
      throw new BusinessException(
        'EXPERTISE_REQUIRED',
        'At least one expertise area is required',
        undefined,
        400,
      );
    }
    let mentor: AlumniMentorProfile;
    try {
      mentor = await this.prisma.alumniMentorProfile.create({
        data: {
          institute_id: actor.institute_id,
          alumni_id: alumniId,
          expertise_areas: expertise,
          max_mentees: dto.max_mentees ?? 3,
          bio: dto.bio,
          availability_note: dto.availability_note,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BusinessException(
          'ALREADY_MENTOR',
          'This alumnus already has a mentor profile',
          undefined,
          409,
        );
      }
      throw err;
    }
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.MENTOR,
      entityId: String(mentor.mentor_id),
      action: 'create',
      newStatus: mentor.status,
      metadata: { alumni_id: alumniId },
    });
    await this.notifications.notifyAlumni(
      {
        instituteId: actor.institute_id,
        entityType: ALUMNI_ENTITY.MENTOR,
        entityId: mentor.mentor_id,
        eventType: 'mentor_registered',
        message:
          'You are now registered as a mentor. Thank you for giving back!',
      },
      { alumni_id: alumniId, email: profile.email },
    );
    return mentor;
  }

  async update(actor: AlumniPlatformUser, id: number, dto: UpdateMentorDto) {
    const existing = await this.lookup.mentor(actor.institute_id, id);
    this.assertCanManage(actor, existing);
    const expertise = dto.expertise_areas
      ? normalizeTags(dto.expertise_areas)
      : undefined;
    if (expertise && expertise.length === 0) {
      throw new BusinessException(
        'EXPERTISE_REQUIRED',
        'At least one expertise area is required',
        undefined,
        400,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Serialise with matching so capacity changes see a stable count.
      await this.lookup.lock(tx, 'mentor', actor.institute_id, id);
      const active = await tx.alumniMentorshipMatch.count({
        where: { mentor_id: id, status: 'active' },
      });
      if (dto.max_mentees !== undefined && dto.max_mentees < active) {
        throw new BusinessException(
          'CAPACITY_BELOW_ACTIVE_MENTEES',
          `max_mentees cannot be below the ${active} active mentee(s)`,
          { active_mentees: active },
        );
      }
      const current = await tx.alumniMentorProfile.findUniqueOrThrow({
        where: { mentor_id: id },
      });
      // The mentor picks available / inactive; fully_booked is then derived below.
      const desired =
        dto.status ??
        (current.status === 'inactive' ? 'inactive' : 'available');
      await tx.alumniMentorProfile.update({
        where: { mentor_id: id },
        data: {
          expertise_areas: expertise,
          max_mentees: dto.max_mentees,
          bio: dto.bio,
          availability_note: dto.availability_note,
          status: desired,
        },
      });
      return syncMentorStatus(tx, id);
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.MENTOR,
      entityId: String(id),
      action: 'update',
      oldStatus: existing.status,
      newStatus: updated.status,
      metadata: { fields: Object.keys(dto) },
    });
    return updated;
  }

  private async withLoad(
    instituteId: string,
    mentors: Array<AlumniMentorProfile>,
  ): Promise<Map<number, number>> {
    if (mentors.length === 0) return new Map();
    const counts = await this.prisma.alumniMentorshipMatch.groupBy({
      by: ['mentor_id'],
      where: {
        institute_id: instituteId,
        status: 'active',
        mentor_id: { in: mentors.map((m) => m.mentor_id) },
      },
      _count: { _all: true },
    });
    return new Map(counts.map((c) => [c.mentor_id, c._count._all]));
  }

  async findAll(
    actor: AlumniPlatformUser,
    query: QueryMentorDto,
    opts: { programId?: number } = {},
  ) {
    const viewer = viewerOf(actor);
    const { skip, take, page, limit } = parsePagination(query);
    const contains = (v: string) => ({
      contains: v,
      mode: 'insensitive' as const,
    });
    const expertise = query.expertise
      ? [
          ...new Set(
            query.expertise.map((t) => t.trim().toLowerCase()).filter(Boolean),
          ),
        ]
      : [];

    const alumniFilter: Prisma.AlumniProfileWhereInput = {
      // Alumni only browse mentors who are active + verified.
      ...(viewer.kind === 'alumni'
        ? { is_active: true, verification_status: 'verified' }
        : {}),
      ...(query.industry ? { industry: contains(query.industry) } : {}),
      ...(query.city ? { city: contains(query.city) } : {}),
      ...(query.country ? { country: contains(query.country) } : {}),
    };
    const where: Prisma.AlumniMentorProfileWhereInput = {
      institute_id: actor.institute_id,
      status: query.available_only ? 'available' : query.status,
      ...(expertise.length > 0
        ? { expertise_areas: { hasSome: expertise } }
        : {}),
      alumni: alumniFilter,
      ...(query.search
        ? {
            OR: [
              { alumni: { full_name: contains(query.search.trim()) } },
              { alumni: { current_company: contains(query.search.trim()) } },
              { bio: contains(query.search.trim()) },
              { expertise_areas: { has: query.search.trim().toLowerCase() } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.alumniMentorProfile.findMany({
        where,
        orderBy: [{ status: 'asc' }, { mentor_id: 'asc' }],
        skip,
        take,
        include: { alumni: { select: ALUMNI_CONTACT_SELECT } },
      }),
      this.prisma.alumniMentorProfile.count({ where }),
    ]);
    const load = await this.withLoad(actor.institute_id, rows);
    const inProgram = opts.programId
      ? await this.prisma.alumniMentorshipMatch.groupBy({
          by: ['mentor_id'],
          where: {
            program_id: opts.programId,
            status: 'active',
            mentor_id: { in: rows.map((r) => r.mentor_id) },
          },
          _count: { _all: true },
        })
      : [];
    const inProgramMap = new Map(
      inProgram.map((c) => [c.mentor_id, c._count._all]),
    );
    return {
      data: rows.map(({ alumni, ...mentor }) => {
        const active = load.get(mentor.mentor_id) ?? 0;
        return {
          ...mentor,
          active_mentees: active,
          open_slots: Math.max(0, mentor.max_mentees - active),
          ...(opts.programId
            ? {
                active_mentees_in_program:
                  inProgramMap.get(mentor.mentor_id) ?? 0,
              }
            : {}),
          alumni: summaryFor(viewer, alumni),
        };
      }),
      pagination: buildMeta(total, page, limit),
    };
  }

  async findOne(actor: AlumniPlatformUser, id: number) {
    const viewer = viewerOf(actor);
    const mentor = await this.prisma.alumniMentorProfile.findFirst({
      where: { mentor_id: id, institute_id: actor.institute_id },
      include: { alumni: { select: ALUMNI_CONTACT_SELECT } },
    });
    if (!mentor) throw new NotFoundException(`Mentor profile #${id} not found`);
    const load = await this.withLoad(actor.institute_id, [mentor]);
    const active = load.get(id) ?? 0;
    const { alumni, ...rest } = mentor;
    return {
      ...rest,
      active_mentees: active,
      open_slots: Math.max(0, mentor.max_mentees - active),
      alumni: summaryFor(viewer, alumni),
    };
  }
}
