import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
import { MATCH_TRANSITIONS, assertTransition } from '../common/alumni-state';
import { BusinessException } from '../common/business-exception';
import { buildMeta, parsePagination } from '../common/pagination.util';
import { localToday, parseDateOnly } from '../common/time.util';
import { isUniqueViolation } from '../common/unique-violation.util';
import { AlumniNotificationService } from '../notifications/alumni-notification.service';
import { syncMentorStatus } from './mentors.service';
import {
  CreateMatchDto,
  QueryMatchDto,
  UpdateMatchDto,
} from './dto/mentorship.dto';

const MATCH_INCLUDE = {
  program: { select: { program_id: true, name: true, status: true } },
  mentor: {
    select: {
      mentor_id: true,
      alumni_id: true,
      status: true,
      expertise_areas: true,
      alumni: { select: ALUMNI_CONTACT_SELECT },
    },
  },
  mentee_alumni: { select: ALUMNI_CONTACT_SELECT },
} satisfies Prisma.AlumniMentorshipMatchInclude;

type MatchRow = Prisma.AlumniMentorshipMatchGetPayload<{
  include: typeof MATCH_INCLUDE;
}>;

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AlumniLookupService,
    private readonly audit: AlumniAuditService,
    private readonly notifications: AlumniNotificationService,
  ) {}

  private present(actor: AlumniPlatformUser, row: MatchRow) {
    const viewer = viewerOf(actor);
    const { mentor, mentee_alumni, ...rest } = row;
    return {
      ...rest,
      mentor: { ...mentor, alumni: summaryFor(viewer, mentor.alumni) },
      mentee_alumni: mentee_alumni ? summaryFor(viewer, mentee_alumni) : null,
    };
  }

  /**
   * Matching is done by staff. In one transaction: the mentor row is locked,
   * capacity is counted under that lock and the match is written before it is
   * released, so two officers matching the last free slot cannot both succeed.
   * Duplicate active matches are additionally blocked by partial unique indexes.
   */
  async create(
    actor: AlumniPlatformUser,
    programId: number,
    dto: CreateMatchDto,
  ) {
    const byAlumnus = dto.mentee_alumni_id !== undefined;
    const byStudent = dto.mentee_student_ref !== undefined;
    if (byAlumnus === byStudent) {
      throw new BusinessException(
        'MENTEE_REQUIRED',
        'Provide exactly one of mentee_alumni_id (alumnus) or mentee_student_ref (current student)',
        undefined,
        400,
      );
    }
    if (byStudent && !dto.mentee_name) {
      throw new BusinessException(
        'MENTEE_NAME_REQUIRED',
        'mentee_name is required with mentee_student_ref',
        undefined,
        400,
      );
    }
    const matchedDate = dto.matched_date
      ? parseDateOnly(dto.matched_date, 'matched_date')
      : localToday();

    await this.lookup.program(actor.institute_id, programId);
    await this.lookup.mentor(actor.institute_id, dto.mentor_id);
    const mentee = byAlumnus
      ? await this.lookup.profile(
          actor.institute_id,
          dto.mentee_alumni_id as number,
        )
      : null;
    if (mentee && !mentee.is_active) {
      throw new BusinessException(
        'ALUMNI_INACTIVE',
        'The mentee profile is deactivated',
      );
    }

    let created: { match_id: number };
    let program: { name: string };
    let mentorAlumni: { alumni_id: number; email: string };
    try {
      ({ created, program, mentorAlumni } = await this.prisma.$transaction(
        async (tx) => {
          await this.lookup.lock(
            tx,
            'mentor',
            actor.institute_id,
            dto.mentor_id,
          );
          const lockedProgram = await this.lookup.program(
            actor.institute_id,
            programId,
            tx,
          );
          if (lockedProgram.status === 'completed') {
            throw new BusinessException(
              'PROGRAM_NOT_MATCHING',
              'This program is completed and no longer accepts matches',
              { status: lockedProgram.status },
            );
          }
          const mentor = await tx.alumniMentorProfile.findUniqueOrThrow({
            where: { mentor_id: dto.mentor_id },
            include: {
              alumni: {
                select: { alumni_id: true, email: true, is_active: true },
              },
            },
          });
          if (mentor.status === 'inactive' || !mentor.alumni.is_active) {
            throw new BusinessException(
              'MENTOR_INACTIVE',
              'This mentor is not available for matching',
            );
          }
          if (mentee && mentee.alumni_id === mentor.alumni_id) {
            throw new BusinessException(
              'SELF_MENTORING',
              'A mentor cannot be matched with themselves',
            );
          }
          const active = await tx.alumniMentorshipMatch.count({
            where: { mentor_id: mentor.mentor_id, status: 'active' },
          });
          if (active >= mentor.max_mentees) {
            throw new BusinessException(
              'MENTOR_AT_CAPACITY',
              'This mentor has no free mentee slots',
              { max_mentees: mentor.max_mentees, active_mentees: active },
              409,
            );
          }
          const duplicate = await tx.alumniMentorshipMatch.findFirst({
            where: {
              program_id: programId,
              status: 'active',
              ...(byAlumnus
                ? { mentee_alumni_id: dto.mentee_alumni_id }
                : { mentee_student_ref: dto.mentee_student_ref }),
            },
            select: { match_id: true },
          });
          if (duplicate) {
            throw new BusinessException(
              'MENTEE_ALREADY_MATCHED',
              'This mentee already has an active mentor in this program',
              { match_id: duplicate.match_id },
              409,
            );
          }
          const match = await tx.alumniMentorshipMatch.create({
            data: {
              institute_id: actor.institute_id,
              program_id: programId,
              mentor_id: mentor.mentor_id,
              mentee_alumni_id: dto.mentee_alumni_id,
              mentee_student_ref: dto.mentee_student_ref,
              mentee_name: byStudent ? dto.mentee_name : undefined,
              matched_date: matchedDate,
              created_by: actor.eddva_user_id,
            },
          });
          await syncMentorStatus(tx, mentor.mentor_id);
          return {
            created: match,
            program: lockedProgram,
            mentorAlumni: mentor.alumni,
          };
        },
      ));
    } catch (err) {
      if (isUniqueViolation(err)) {
        // The partial unique index caught a racing duplicate the check above missed.
        throw new BusinessException(
          'MENTEE_ALREADY_MATCHED',
          'This mentee already has an active mentor in this program',
          undefined,
          409,
        );
      }
      throw err;
    }

    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.MATCH,
      entityId: String(created.match_id),
      action: 'create',
      newStatus: 'active',
      metadata: {
        program_id: programId,
        mentor_id: dto.mentor_id,
        mentee_alumni_id: dto.mentee_alumni_id ?? null,
        mentee_student_ref: dto.mentee_student_ref ?? null,
      },
    });
    const menteeLabel = mentee?.full_name ?? dto.mentee_name ?? 'a student';
    await this.notifications.notifyAlumni(
      {
        instituteId: actor.institute_id,
        entityType: ALUMNI_ENTITY.MATCH,
        entityId: created.match_id,
        eventType: 'mentor_matched',
        message: `You have been matched with ${menteeLabel} in "${program.name}".`,
      },
      { alumni_id: mentorAlumni.alumni_id, email: mentorAlumni.email },
    );
    if (mentee) {
      await this.notifications.notifyAlumni(
        {
          instituteId: actor.institute_id,
          entityType: ALUMNI_ENTITY.MATCH,
          entityId: created.match_id,
          eventType: 'mentor_matched',
          message: `You have been matched with a mentor in "${program.name}".`,
        },
        { alumni_id: mentee.alumni_id, email: mentee.email },
      );
    }
    return this.findOne(actor, created.match_id);
  }

  /** active → completed | discontinued; frees the mentor's slot. */
  async updateStatus(
    actor: AlumniPlatformUser,
    id: number,
    dto: UpdateMatchDto,
  ) {
    const match = await this.lookup.match(actor.institute_id, id);
    assertTransition(MATCH_TRANSITIONS, match.status, dto.status, 'The match');

    await this.prisma.$transaction(async (tx) => {
      await this.lookup.lock(tx, 'mentor', actor.institute_id, match.mentor_id);
      const { count } = await tx.alumniMentorshipMatch.updateMany({
        where: { match_id: id, status: 'active' },
        data: {
          status: dto.status,
          ended_at: new Date(),
          end_reason: dto.reason,
        },
      });
      if (count === 0) {
        throw new BusinessException(
          'MATCH_CHANGED',
          'This match was updated meanwhile; refresh and retry',
          undefined,
          409,
        );
      }
      await syncMentorStatus(tx, match.mentor_id);
    });

    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.MATCH,
      entityId: String(id),
      action: 'status_change',
      oldStatus: 'active',
      newStatus: dto.status,
      reason: dto.reason,
    });
    const full = await this.prisma.alumniMentorshipMatch.findUniqueOrThrow({
      where: { match_id: id },
      include: MATCH_INCLUDE,
    });
    const event = {
      instituteId: actor.institute_id,
      entityType: ALUMNI_ENTITY.MATCH,
      entityId: id,
      eventType:
        dto.status === 'completed' ? 'match_completed' : 'match_discontinued',
      message: `Your mentorship in "${full.program.name}" was ${dto.status}${
        dto.reason ? `: ${dto.reason}` : '.'
      }`,
    };
    const mentorAlumni = await this.prisma.alumniProfile.findUnique({
      where: { alumni_id: full.mentor.alumni_id },
      select: { email: true },
    });
    await this.notifications.notifyAlumni(event, {
      alumni_id: full.mentor.alumni_id,
      email: mentorAlumni?.email,
    });
    if (full.mentee_alumni) {
      await this.notifications.notifyAlumni(event, {
        alumni_id: full.mentee_alumni.alumni_id,
        email: full.mentee_alumni.email,
      });
    }
    return this.present(actor, full);
  }

  /** Staff: any match, filterable. Alumni: only matches they are part of (as mentor or mentee). */
  async findAll(
    actor: AlumniPlatformUser,
    query: QueryMatchDto,
    programId?: number,
  ) {
    const { skip, take, page, limit } = parsePagination(query);
    const own = isAlumniPrincipal(actor);
    const where: Prisma.AlumniMentorshipMatchWhereInput = {
      institute_id: actor.institute_id,
      program_id: programId ?? query.program_id,
      status: query.status,
      ...(own
        ? {
            OR: [
              { mentor: { alumni_id: actor.alumni_id } },
              { mentee_alumni_id: actor.alumni_id },
            ],
          }
        : {
            mentor_id: query.mentor_id,
            mentee_alumni_id: query.mentee_alumni_id,
          }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.alumniMentorshipMatch.findMany({
        where,
        orderBy: [{ matched_date: 'desc' }, { match_id: 'desc' }],
        skip,
        take,
        include: MATCH_INCLUDE,
      }),
      this.prisma.alumniMentorshipMatch.count({ where }),
    ]);
    return {
      data: rows.map((r) => this.present(actor, r)),
      pagination: buildMeta(total, page, limit),
    };
  }

  async findOne(actor: AlumniPlatformUser, id: number) {
    const row = await this.prisma.alumniMentorshipMatch.findFirst({
      where: {
        match_id: id,
        institute_id: actor.institute_id,
        ...(isAlumniPrincipal(actor)
          ? {
              OR: [
                { mentor: { alumni_id: actor.alumni_id } },
                { mentee_alumni_id: actor.alumni_id },
              ],
            }
          : {}),
      },
      include: MATCH_INCLUDE,
    });
    if (!row) throw new NotFoundException(`Mentorship match #${id} not found`);
    return this.present(actor, row);
  }

  /** Status history (audit trail) of one match. */
  async history(actor: AlumniPlatformUser, id: number) {
    await this.findOne(actor, id); // enforces the same visibility as reading the match
    return this.audit.trail(ALUMNI_ENTITY.MATCH, id);
  }
}
