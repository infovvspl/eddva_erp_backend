import { Injectable } from '@nestjs/common';
import { AlumniMentorshipProgram, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { AlumniAuditService } from '../common/alumni-audit.service';
import { ALUMNI_ENTITY } from '../common/alumni-entities';
import { AlumniLookupService } from '../common/alumni-lookup.service';
import { PROGRAM_TRANSITIONS, assertTransition } from '../common/alumni-state';
import { BusinessException } from '../common/business-exception';
import { buildMeta, parsePagination } from '../common/pagination.util';
import { localToday, parseDateOnly } from '../common/time.util';
import { orConflict } from '../common/unique-violation.util';
import { AlumniNotificationService } from '../notifications/alumni-notification.service';
import { syncMentorStatus } from './mentors.service';
import {
  CreateProgramDto,
  QueryProgramDto,
  UpdateProgramDto,
} from './dto/mentorship.dto';

const DUPLICATE = 'A mentorship program with this name already exists';

@Injectable()
export class ProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AlumniLookupService,
    private readonly audit: AlumniAuditService,
    private readonly notifications: AlumniNotificationService,
  ) {}

  private assertDates(start: Date, end: Date) {
    if (end.getTime() < start.getTime()) {
      throw new BusinessException(
        'INVALID_PROGRAM_DATES',
        'end_date cannot be before start_date',
      );
    }
  }

  async create(actor: AlumniPlatformUser, dto: CreateProgramDto) {
    const start = parseDateOnly(dto.start_date, 'start_date');
    const end = parseDateOnly(dto.end_date, 'end_date');
    this.assertDates(start, end);
    if (end.getTime() < localToday().getTime()) {
      throw new BusinessException(
        'INVALID_PROGRAM_DATES',
        'end_date cannot be in the past',
      );
    }
    const program = await orConflict(DUPLICATE, () =>
      this.prisma.alumniMentorshipProgram.create({
        data: {
          institute_id: actor.institute_id,
          name: dto.name,
          description: dto.description,
          start_date: start,
          end_date: end,
          created_by: actor.eddva_user_id,
        },
      }),
    );
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.PROGRAM,
      entityId: String(program.program_id),
      action: 'create',
      newStatus: program.status,
    });
    return program;
  }

  async findAll(actor: AlumniPlatformUser, query: QueryProgramDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.AlumniMentorshipProgramWhereInput = {
      institute_id: actor.institute_id,
      status: query.status,
      ...(query.search
        ? { name: { contains: query.search.trim(), mode: 'insensitive' } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alumniMentorshipProgram.findMany({
        where,
        orderBy: [{ start_date: 'desc' }, { program_id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.alumniMentorshipProgram.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(actor: AlumniPlatformUser, id: number) {
    const program = await this.lookup.program(actor.institute_id, id);
    const byStatus = await this.prisma.alumniMentorshipMatch.groupBy({
      by: ['status'],
      where: { program_id: id },
      _count: { _all: true },
    });
    return {
      ...program,
      match_counts: Object.fromEntries(
        byStatus.map((r) => [r.status, r._count._all]),
      ),
    };
  }

  async update(actor: AlumniPlatformUser, id: number, dto: UpdateProgramDto) {
    const existing = await this.lookup.program(actor.institute_id, id);
    if (existing.status === 'completed') {
      throw new BusinessException(
        'PROGRAM_COMPLETED',
        'A completed program cannot be edited',
      );
    }
    const start = dto.start_date
      ? parseDateOnly(dto.start_date, 'start_date')
      : existing.start_date;
    const end = dto.end_date
      ? parseDateOnly(dto.end_date, 'end_date')
      : existing.end_date;
    this.assertDates(start, end);
    if (dto.status) {
      assertTransition(
        PROGRAM_TRANSITIONS,
        existing.status,
        dto.status,
        'The program',
      );
    }
    const updated = await orConflict(DUPLICATE, () =>
      this.prisma.alumniMentorshipProgram.update({
        where: { program_id: id },
        data: {
          name: dto.name,
          description: dto.description,
          start_date: start,
          end_date: end,
          status: dto.status,
        },
      }),
    );
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.PROGRAM,
      entityId: String(id),
      action: 'update',
      oldStatus: existing.status,
      newStatus: updated.status,
      metadata: { fields: Object.keys(dto) },
    });
    return updated;
  }

  /**
   * Completes a program. Its active matches are completed with it (a mentor's
   * capacity is freed for the next program) and every mentor / mentee is told.
   */
  async close(
    actor: AlumniPlatformUser | undefined,
    instituteId: string,
    id: number,
  ) {
    const program = await this.lookup.program(instituteId, id);
    assertTransition(
      PROGRAM_TRANSITIONS,
      program.status,
      'completed',
      'The program',
    );

    const ended = await this.prisma.$transaction(async (tx) => {
      await this.lookup.lock(tx, 'program', instituteId, id);
      const { count } = await tx.alumniMentorshipProgram.updateMany({
        where: { program_id: id, status: { not: 'completed' } },
        data: { status: 'completed' },
      });
      if (count === 0) {
        throw new BusinessException(
          'PROGRAM_COMPLETED',
          'This program is already completed',
          undefined,
          409,
        );
      }
      const active = await tx.alumniMentorshipMatch.findMany({
        where: { program_id: id, status: 'active' },
        include: {
          mentor: {
            select: { alumni_id: true, alumni: { select: { email: true } } },
          },
          mentee_alumni: { select: { alumni_id: true, email: true } },
        },
      });
      await tx.alumniMentorshipMatch.updateMany({
        where: { program_id: id, status: 'active' },
        data: {
          status: 'completed',
          ended_at: new Date(),
          end_reason: 'program_completed',
        },
      });
      for (const mentorId of new Set(active.map((m) => m.mentor_id))) {
        await tx.$queryRaw`SELECT 1 FROM "alumni_mentor_profiles" WHERE "mentor_id" = ${mentorId} FOR UPDATE`;
        await syncMentorStatus(tx, mentorId);
      }
      return active;
    });

    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.PROGRAM,
      entityId: String(id),
      action: 'close',
      oldStatus: program.status,
      newStatus: 'completed',
      metadata: { matches_completed: ended.length },
    });
    for (const match of ended) {
      const event = {
        instituteId,
        entityType: ALUMNI_ENTITY.MATCH,
        entityId: match.match_id,
        eventType: 'match_completed',
        message: `Your mentorship in "${program.name}" is complete. Thank you!`,
      };
      await this.notifications.notifyAlumni(event, {
        alumni_id: match.mentor.alumni_id,
        email: match.mentor.alumni.email,
      });
      if (match.mentee_alumni) {
        await this.notifications.notifyAlumni(event, {
          alumni_id: match.mentee_alumni.alumni_id,
          email: match.mentee_alumni.email,
        });
      }
    }
    return {
      ...(await this.lookup.program(instituteId, id)),
      matches_completed: ended.length,
    };
  }

  /** Scheduled: complete programs whose end date has passed. */
  async completeEndedPrograms(): Promise<number> {
    const due: AlumniMentorshipProgram[] =
      await this.prisma.alumniMentorshipProgram.findMany({
        where: { status: { not: 'completed' }, end_date: { lt: localToday() } },
      });
    let done = 0;
    for (const program of due) {
      try {
        await this.close(undefined, program.institute_id, program.program_id);
        done += 1;
      } catch (err) {
        // A concurrent manual close is fine; anything else is logged by the scheduler wrapper.
        if (!(err instanceof BusinessException)) throw err;
      }
    }
    return done;
  }
}
