import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AdmissionTestRegistration, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { AdmissionAuditService } from '../common/admission-audit.service';
import { AdmissionLookupService } from '../common/admission-lookup.service';
import { AdmissionNumberingService } from '../common/admission-numbering.service';
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
  CreateEntranceTestDto,
  QueryEntranceTestDto,
  RecordResultsDto,
  RegisterApplicantsDto,
  UpdateEntranceTestDto,
  UpdateRegistrationDto,
} from './dto/test.dto';

const SORT_FIELDS = ['test_date', 'name', 'created_at'] as const;

@Injectable()
export class TestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AdmissionLookupService,
    private readonly numbering: AdmissionNumberingService,
    private readonly audit: AdmissionAuditService,
    private readonly notifications: AdmissionNotificationService,
  ) {}

  private assertVenue(mode: string, venue?: string | null) {
    if (mode === 'offline' && !venue?.trim()) {
      throw new BusinessException(
        'VENUE_REQUIRED',
        'A venue is required for an offline test.',
      );
    }
  }

  // ─── Test CRUD ────────────────────────────────────────────────────────────

  async create(actor: AdmissionPlatformUser, dto: CreateEntranceTestDto) {
    await this.lookup.session(actor.institute_id, dto.session_id);
    await this.lookup.program(actor.institute_id, dto.program_id);
    this.assertVenue(dto.mode, dto.venue);

    const test = await this.prisma.admissionEntranceTest.create({
      data: {
        institute_id: actor.institute_id,
        name: dto.name,
        session_id: dto.session_id,
        program_id: dto.program_id,
        test_date: new Date(dto.test_date),
        mode: dto.mode,
        venue: dto.venue,
        max_marks: new Prisma.Decimal(dto.max_marks),
        created_by: actor.eddva_user_id,
      },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.TEST,
      entityId: String(test.test_id),
      action: 'create',
    });
    return test;
  }

  async findAll(instituteId: string, query: QueryEntranceTestDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, 'test_date');
    const where: Prisma.AdmissionEntranceTestWhereInput = {
      institute_id: instituteId,
      deleted_at: null,
      session_id: query.session_id,
      program_id: query.program_id,
      mode: query.mode,
      test_date: buildDateRange(query.from, query.to),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { venue: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.admissionEntranceTest.findMany({
        where,
        orderBy: { [sortBy]: parseSortOrder(query.sortOrder) },
        skip,
        take,
        include: {
          session: { select: { session_id: true, name: true } },
          program: { select: { program_id: true, name: true } },
          _count: { select: { registrations: true, results: true } },
        },
      }),
      this.prisma.admissionEntranceTest.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const test = await this.prisma.admissionEntranceTest.findFirst({
      where: { test_id: id, institute_id: instituteId, deleted_at: null },
      include: {
        session: { select: { session_id: true, name: true } },
        program: { select: { program_id: true, name: true } },
        _count: { select: { registrations: true, results: true } },
      },
    });
    if (!test) throw new NotFoundException(`Entrance test #${id} not found`);
    return test;
  }

  async update(
    actor: AdmissionPlatformUser,
    id: number,
    dto: UpdateEntranceTestDto,
  ) {
    const existing = await this.lookup.test(actor.institute_id, id);
    const moving =
      (dto.session_id && dto.session_id !== existing.session_id) ||
      (dto.program_id && dto.program_id !== existing.program_id);
    if (moving) {
      const registrations = await this.prisma.admissionTestRegistration.count({
        where: { test_id: id },
      });
      if (registrations > 0) {
        throw new BusinessException(
          'TEST_HAS_REGISTRATIONS',
          'Program/session cannot change once applicants are registered for the test.',
          { registrations },
        );
      }
      if (dto.session_id)
        await this.lookup.session(actor.institute_id, dto.session_id);
      if (dto.program_id)
        await this.lookup.program(actor.institute_id, dto.program_id);
    }
    if (dto.max_marks !== undefined) {
      const over = await this.prisma.admissionTestResult.count({
        where: {
          test_id: id,
          marks_obtained: { gt: new Prisma.Decimal(dto.max_marks) },
        },
      });
      if (over > 0) {
        throw new BusinessException(
          'MAX_MARKS_BELOW_RESULTS',
          `${over} recorded result(s) exceed the new maximum marks.`,
          { results_over_max: over },
        );
      }
    }
    this.assertVenue(dto.mode ?? existing.mode, dto.venue ?? existing.venue);

    const updated = await this.prisma.admissionEntranceTest.update({
      where: { test_id: id },
      data: {
        name: dto.name,
        session_id: dto.session_id,
        program_id: dto.program_id,
        test_date: dto.test_date ? new Date(dto.test_date) : undefined,
        mode: dto.mode,
        venue: dto.venue,
        max_marks:
          dto.max_marks !== undefined
            ? new Prisma.Decimal(dto.max_marks)
            : undefined,
      },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.TEST,
      entityId: String(id),
      action: 'update',
      metadata: { changed_fields: Object.keys(dto) },
    });
    return updated;
  }

  // ─── Registrations ────────────────────────────────────────────────────────

  /**
   * Registers applications for a test and issues each a unique hall ticket
   * number. All-or-nothing: every application is validated first and the batch
   * is rejected with the full list of problems, so a partial registration can
   * never be left behind.
   */
  async register(
    actor: AdmissionPlatformUser,
    testId: number,
    dto: RegisterApplicantsDto,
  ) {
    const test = await this.lookup.test(actor.institute_id, testId);

    const created = await this.prisma.$transaction(async (tx) => {
      const applications = await tx.admissionApplication.findMany({
        where: {
          application_id: { in: dto.application_ids },
          institute_id: actor.institute_id,
          deleted_at: null,
        },
        include: {
          applicant: { select: { name: true, email: true, phone: true } },
        },
      });
      const found = new Map(applications.map((a) => [a.application_id, a]));
      const existing = await tx.admissionTestRegistration.findMany({
        where: { test_id: testId, application_id: { in: dto.application_ids } },
        select: { application_id: true },
      });
      const alreadyRegistered = new Set(existing.map((r) => r.application_id));

      const problems: { application_id: number; reason: string }[] = [];
      for (const id of dto.application_ids) {
        const app = found.get(id);
        if (!app) problems.push({ application_id: id, reason: 'NOT_FOUND' });
        else if (alreadyRegistered.has(id))
          problems.push({ application_id: id, reason: 'ALREADY_REGISTERED' });
        else if (
          app.program_id !== test.program_id ||
          app.session_id !== test.session_id
        )
          problems.push({
            application_id: id,
            reason: 'PROGRAM_OR_SESSION_MISMATCH',
          });
        else if (!ASSESSABLE_STATUSES.includes(app.status))
          problems.push({
            application_id: id,
            reason: `STATUS_${app.status.toUpperCase()}_NOT_ELIGIBLE`,
          });
      }
      if (problems.length > 0) {
        throw new BusinessException(
          'REGISTRATION_REJECTED',
          `${problems.length} application(s) cannot be registered for this test. Nothing was registered.`,
          { problems },
          problems.every((p) => p.reason === 'ALREADY_REGISTERED')
            ? HttpStatus.CONFLICT
            : HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      const registrations: AdmissionTestRegistration[] = [];
      for (const id of dto.application_ids) {
        registrations.push(
          await tx.admissionTestRegistration.create({
            data: {
              application_id: id,
              test_id: testId,
              hall_ticket_number: await this.numbering.next('HALL_TICKET', tx),
              registered_by: actor.eddva_user_id,
            },
          }),
        );
      }

      // Registration moves fresh applications into "test_scheduled". Guarded by
      // current status so it never overwrites a concurrent decision.
      const movable = applications
        .filter((a) => a.status === 'submitted' || a.status === 'under_review')
        .map((a) => a.application_id);
      if (movable.length > 0) {
        await tx.admissionApplication.updateMany({
          where: {
            application_id: { in: movable },
            status: { in: ['submitted', 'under_review'] },
          },
          data: { status: 'test_scheduled' },
        });
      }
      return { registrations, applications, movable };
    });

    for (const registration of created.registrations) {
      const app = created.applications.find(
        (a) => a.application_id === registration.application_id,
      )!;
      await this.audit.log(actor, {
        entityType: ADM_ENTITY.TEST_REGISTRATION,
        entityId: String(registration.registration_id),
        action: 'register',
        newStatus: registration.status,
        metadata: {
          application_id: registration.application_id,
          test_id: testId,
          hall_ticket_number: registration.hall_ticket_number,
        },
      });
      if (created.movable.includes(app.application_id)) {
        await this.audit.log(actor, {
          entityType: ADM_ENTITY.APPLICATION,
          entityId: String(app.application_id),
          action: 'status_change',
          oldStatus: app.status,
          newStatus: 'test_scheduled',
          reason: 'Registered for entrance test',
          metadata: { application_id: app.application_id, test_id: testId },
        });
      }
    }
    await this.notifications.queueMany(
      created.registrations.map((r) => {
        const applicant = created.applications.find(
          (a) => a.application_id === r.application_id,
        )!.applicant;
        return {
          instituteId: actor.institute_id,
          entityType: ADM_ENTITY.TEST_REGISTRATION,
          entityId: r.registration_id,
          eventType: 'hall_ticket_issued',
          recipient: applicant.email ?? applicant.phone,
          channel: applicant.email ? ('email' as const) : ('sms' as const),
          message: `Hall ticket ${r.hall_ticket_number} for ${test.name}.`,
        };
      }),
    );
    return created.registrations;
  }

  async listRegistrations(instituteId: string, testId: number) {
    await this.lookup.test(instituteId, testId);
    return this.prisma.admissionTestRegistration.findMany({
      where: { test_id: testId },
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
      orderBy: { hall_ticket_number: 'asc' },
    });
  }

  async updateRegistration(
    actor: AdmissionPlatformUser,
    testId: number,
    registrationId: number,
    dto: UpdateRegistrationDto,
  ) {
    await this.lookup.test(actor.institute_id, testId);
    if (dto.status === 'registered') {
      throw new BusinessException(
        'INVALID_STATUS',
        'Attendance can only be set to appeared or absent.',
      );
    }
    const registration = await this.prisma.admissionTestRegistration.findFirst({
      where: { registration_id: registrationId, test_id: testId },
    });
    if (!registration)
      throw new NotFoundException(`Registration #${registrationId} not found`);

    if (dto.status === 'absent') {
      const result = await this.prisma.admissionTestResult.count({
        where: { test_id: testId, application_id: registration.application_id },
      });
      if (result > 0) {
        throw new BusinessException(
          'RESULT_ALREADY_RECORDED',
          'A result is already recorded for this applicant, so they cannot be marked absent.',
        );
      }
    }
    const updated = await this.prisma.admissionTestRegistration.update({
      where: { registration_id: registrationId },
      data: { status: dto.status },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.TEST_REGISTRATION,
      entityId: String(registrationId),
      action: 'attendance',
      oldStatus: registration.status,
      newStatus: dto.status,
      metadata: {
        application_id: registration.application_id,
        test_id: testId,
      },
    });
    return updated;
  }

  // ─── Results ──────────────────────────────────────────────────────────────

  /**
   * Records (or corrects) marks and recomputes ranks for the whole test in one
   * transaction. Ranks are competition-style (ties share a rank, the next rank
   * skips), highest marks first. Rank stays null until a result exists.
   */
  async recordResults(
    actor: AdmissionPlatformUser,
    testId: number,
    dto: RecordResultsDto,
  ) {
    const test = await this.lookup.test(actor.institute_id, testId);
    const ids = dto.results.map((r) => r.application_id);
    if (new Set(ids).size !== ids.length) {
      throw new BusinessException(
        'DUPLICATE_ENTRIES',
        'Each application may appear only once per request.',
      );
    }

    const changes = await this.prisma.$transaction(async (tx) => {
      const registrations = await tx.admissionTestRegistration.findMany({
        where: { test_id: testId, application_id: { in: ids } },
      });
      const byApp = new Map(registrations.map((r) => [r.application_id, r]));

      const problems: { application_id: number; reason: string }[] = [];
      for (const entry of dto.results) {
        const reg = byApp.get(entry.application_id);
        if (!reg)
          problems.push({
            application_id: entry.application_id,
            reason: 'NOT_REGISTERED',
          });
        else if (reg.status === 'absent')
          problems.push({
            application_id: entry.application_id,
            reason: 'MARKED_ABSENT',
          });
        else if (new Prisma.Decimal(entry.marks_obtained).gt(test.max_marks))
          problems.push({
            application_id: entry.application_id,
            reason: `MARKS_EXCEED_MAX_${test.max_marks.toString()}`,
          });
      }
      if (problems.length > 0) {
        throw new BusinessException(
          'RESULTS_REJECTED',
          `${problems.length} result(s) are invalid. Nothing was recorded.`,
          { problems },
        );
      }

      const applied: {
        application_id: number;
        old: Prisma.Decimal | null;
        new: Prisma.Decimal;
      }[] = [];
      for (const entry of dto.results) {
        const marks = new Prisma.Decimal(entry.marks_obtained);
        const previous = await tx.admissionTestResult.findUnique({
          where: {
            application_id_test_id: {
              application_id: entry.application_id,
              test_id: testId,
            },
          },
        });
        if (previous) {
          await tx.admissionTestResult.update({
            where: { result_id: previous.result_id },
            data: { marks_obtained: marks, recorded_by: actor.eddva_user_id },
          });
        } else {
          await tx.admissionTestResult.create({
            data: {
              application_id: entry.application_id,
              test_id: testId,
              marks_obtained: marks,
              recorded_by: actor.eddva_user_id,
            },
          });
        }
        await tx.admissionTestRegistration.updateMany({
          where: {
            test_id: testId,
            application_id: entry.application_id,
            status: 'registered',
          },
          data: { status: 'appeared' },
        });
        applied.push({
          application_id: entry.application_id,
          old: previous?.marks_obtained ?? null,
          new: marks,
        });
      }

      await tx.$executeRaw(Prisma.sql`
        UPDATE admission_test_results r
        SET rank = ranked.rnk
        FROM (
          SELECT result_id, RANK() OVER (ORDER BY marks_obtained DESC)::int AS rnk
          FROM admission_test_results
          WHERE test_id = ${testId}
        ) ranked
        WHERE r.result_id = ranked.result_id
      `);
      return applied;
    });

    for (const change of changes) {
      await this.audit.log(actor, {
        entityType: ADM_ENTITY.TEST_RESULT,
        entityId: `${testId}:${change.application_id}`,
        action: change.old ? 'correct' : 'record',
        metadata: {
          application_id: change.application_id,
          test_id: testId,
          marks_obtained: change.new.toString(),
          previous_marks: change.old?.toString() ?? null,
        },
      });
    }
    return this.getResults(actor.institute_id, testId);
  }

  async getResults(instituteId: string, testId: number) {
    await this.lookup.test(instituteId, testId);
    return this.prisma.admissionTestResult.findMany({
      where: { test_id: testId },
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
      orderBy: [{ rank: 'asc' }, { result_id: 'asc' }],
    });
  }
}
