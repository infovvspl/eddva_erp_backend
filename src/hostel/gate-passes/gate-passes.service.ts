import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HostelGatePassStatus, HostelResident, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAuditService } from '../common/hostel-audit.service';
import { HostelLookupService } from '../common/hostel-lookup.service';
import { HostelNumberingService } from '../common/hostel-numbering.service';
import { HostelNotificationService } from '../notifications/hostel-notification.service';
import { HOSTEL_ENTITY } from '../common/hostel-entities';
import { BusinessException } from '../common/business-exception';
import {
  GATE_PASS_TRANSITIONS,
  assertTransition,
} from '../common/hostel-state';
import { isUniqueViolation } from '../common/unique-violation.util';
import { dayRange, localToday, parseDateTime } from '../common/time.util';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
  parseSort,
  parseSortOrder,
} from '../common/pagination.util';
import {
  CreateGatePassDto,
  GateScanDto,
  QueryGatePassDto,
} from './dto/gate-pass.dto';

const SORT_FIELDS = [
  'requested_out_at',
  'expected_return_at',
  'created_at',
  'status',
] as const;

/** A resident may be scanned out this long before the requested out time (guards are not clock-exact). */
const EARLY_SCAN_GRACE_MINUTES = 60;
/** Requests may start slightly in the past (a warden raising a pass as the resident heads out). */
const PAST_REQUEST_TOLERANCE_MINUTES = 30;
const MAX_PASS_DAYS = 90;
const MINUTE_MS = 60 * 1000;

const OPEN_STATUSES: HostelGatePassStatus[] = [
  'pending',
  'approved',
  'out',
  'overdue',
];

const PASS_INCLUDE = {
  resident: {
    select: {
      resident_id: true,
      student_name: true,
      admission_no: true,
      gender: true,
      grade: true,
      guardian_name: true,
      guardian_phone: true,
      guardian_email: true,
      status: true,
    },
  },
} satisfies Prisma.HostelGatePassInclude;

type PassWithResident = Prisma.HostelGatePassGetPayload<{
  include: typeof PASS_INCLUDE;
}>;

/**
 * Gate pass lifecycle: pending → approved → out → returned, with rejected /
 * cancelled / expired / overdue as the side exits. The pass is *permission*;
 * the gate scan is the *source of truth* for actual movement.
 *
 * Every state change is a conditional UPDATE guarded by the expected current
 * status (and a row lock), so two guards scanning the same pass at once, or an
 * approver racing a canceller, resolve to exactly one winner.
 */
@Injectable()
export class GatePassesService {
  private readonly logger = new Logger(GatePassesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: HostelLookupService,
    private readonly numbering: HostelNumberingService,
    private readonly audit: HostelAuditService,
    private readonly notifications: HostelNotificationService,
  ) {}

  /** `is_overdue` is computed live so the API is right even before the sweep has run. */
  private decorate<
    T extends {
      status: HostelGatePassStatus;
      expected_return_at: Date;
      actual_return_at: Date | null;
    },
  >(pass: T, now = new Date()) {
    const late =
      (pass.status === 'out' || pass.status === 'overdue') &&
      !pass.actual_return_at &&
      pass.expected_return_at < now;
    return {
      ...pass,
      is_overdue: late,
      overdue_by_minutes: late
        ? Math.floor(
            (now.getTime() - pass.expected_return_at.getTime()) / MINUTE_MS,
          )
        : 0,
    };
  }

  private async blockWarden(residentId: number): Promise<string | null> {
    const allotment = await this.prisma.hostelRoomAllotment.findFirst({
      where: { resident_id: residentId, status: 'active' },
      select: {
        room: { select: { block: { select: { warden_user_id: true } } } },
      },
    });
    return allotment?.room.block.warden_user_id ?? null;
  }

  /**
   * A resident cannot hold two conflicting passes: any pending/approved/out/overdue
   * pass whose window overlaps the new one blocks it, and while a resident is
   * outside (out/overdue) nothing new can be requested until they are back.
   */
  private async assertNoConflict(
    tx: Prisma.TransactionClient,
    residentId: number,
    from: Date,
    to: Date,
    opts: {
      exceptId?: number;
      statuses: HostelGatePassStatus[];
      blockIfOut: boolean;
    },
  ) {
    const conflicts = await tx.hostelGatePass.findMany({
      where: {
        resident_id: residentId,
        ...(opts.exceptId ? { gate_pass_id: { not: opts.exceptId } } : {}),
        status: { in: opts.statuses },
        OR: [
          { requested_out_at: { lt: to }, expected_return_at: { gt: from } },
          ...(opts.blockIfOut
            ? [{ status: { in: ['out', 'overdue'] as HostelGatePassStatus[] } }]
            : []),
        ],
      },
      select: { gate_pass_id: true, pass_no: true, status: true },
      take: 5,
    });
    if (conflicts.length > 0) {
      throw new BusinessException(
        'GATE_PASS_CONFLICT',
        `Resident already has a conflicting gate pass (${conflicts.map((c) => `${c.pass_no}: ${c.status}`).join(', ')})`,
        { conflicts },
        HttpStatus.CONFLICT,
      );
    }
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(actor: HostelPlatformUser, dto: CreateGatePassDto) {
    const out = parseDateTime(dto.requested_out_at, 'requested_out_at');
    const back = parseDateTime(dto.expected_return_at, 'expected_return_at');
    const now = new Date();

    if (back <= out) {
      throw new BusinessException(
        'INVALID_PASS_WINDOW',
        'expected_return_at must be after requested_out_at',
      );
    }
    if (
      out.getTime() <
      now.getTime() - PAST_REQUEST_TOLERANCE_MINUTES * MINUTE_MS
    ) {
      throw new BusinessException(
        'INVALID_PASS_WINDOW',
        'requested_out_at cannot be in the past',
      );
    }
    if (
      (back.getTime() - out.getTime()) / (24 * 60 * MINUTE_MS) >
      MAX_PASS_DAYS
    ) {
      throw new BusinessException(
        'INVALID_PASS_WINDOW',
        `A gate pass cannot span more than ${MAX_PASS_DAYS} days`,
      );
    }
    if (
      dto.pass_type === 'day_outing' &&
      back.getTime() - out.getTime() > 24 * 60 * MINUTE_MS
    ) {
      throw new BusinessException(
        'INVALID_PASS_WINDOW',
        'A day outing must return within 24 hours; use a weekend or home leave for longer',
      );
    }
    await this.lookup.resident(actor.institute_id, dto.resident_id);

    let pass: PassWithResident;
    let resident: HostelResident;
    try {
      ({ pass, resident } = await this.prisma.$transaction(async (tx) => {
        const resident = await this.lookup.lockResident(
          actor.institute_id,
          dto.resident_id,
          tx,
        );
        if (resident.status !== 'active') {
          throw new BusinessException(
            'RESIDENT_NOT_ACTIVE',
            `Resident is ${resident.status}; only active residents can be given a gate pass`,
            { status: resident.status },
          );
        }
        await this.assertNoConflict(tx, resident.resident_id, out, back, {
          statuses: OPEN_STATUSES,
          blockIfOut: true,
        });
        const pass_no = await this.numbering.next('GATE_PASS', tx);
        const pass = await tx.hostelGatePass.create({
          data: {
            institute_id: actor.institute_id,
            pass_no,
            resident_id: resident.resident_id,
            pass_type: dto.pass_type,
            reason: dto.reason,
            destination: dto.destination,
            requested_out_at: out,
            expected_return_at: back,
            requested_by: actor.eddva_user_id,
          },
          include: PASS_INCLUDE,
        });
        return { pass, resident };
      }));
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BusinessException(
          'GATE_PASS_CONFLICT',
          'A conflicting gate pass was created at the same time',
          undefined,
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }

    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.GATE_PASS,
      entityId: String(pass.gate_pass_id),
      action: 'create',
      newStatus: 'pending',
      metadata: {
        pass_no: pass.pass_no,
        resident_id: pass.resident_id,
        pass_type: pass.pass_type,
      },
    });
    await this.notifications.notifyStaff(
      {
        instituteId: actor.institute_id,
        entityType: HOSTEL_ENTITY.GATE_PASS,
        entityId: pass.gate_pass_id,
        eventType: 'gate_pass_requested',
        message: `Gate pass ${pass.pass_no} requested for ${resident.student_name} (${pass.pass_type}, ${pass.destination}).`,
      },
      [await this.blockWarden(resident.resident_id)],
    );
    return this.decorate(pass);
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  async findOne(instituteId: string, id: number) {
    const pass = await this.prisma.hostelGatePass.findFirst({
      where: { gate_pass_id: id, institute_id: instituteId },
      include: PASS_INCLUDE,
    });
    if (!pass) throw new NotFoundException(`Gate pass #${id} not found`);
    return this.decorate(pass);
  }

  private listWhere(
    instituteId: string,
    query: QueryGatePassDto,
  ): Prisma.HostelGatePassWhereInput {
    const range = buildDateRange(query.from, query.to);
    return {
      institute_id: instituteId,
      status: query.status,
      pass_type: query.pass_type,
      resident_id: query.resident_id,
      ...(range ? { requested_out_at: range } : {}),
      ...(query.block_id
        ? {
            resident: {
              allotments: {
                some: { status: 'active', room: { block_id: query.block_id } },
              },
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { pass_no: { contains: query.search, mode: 'insensitive' } },
              { destination: { contains: query.search, mode: 'insensitive' } },
              {
                resident: {
                  student_name: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                resident: {
                  admission_no: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
  }

  private async page(
    query: QueryGatePassDto,
    where: Prisma.HostelGatePassWhereInput,
    defaultSort: (typeof SORT_FIELDS)[number] = 'requested_out_at',
    defaultOrder: 'asc' | 'desc' = 'desc',
  ) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, defaultSort);
    const now = new Date();
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.hostelGatePass.findMany({
        where,
        include: PASS_INCLUDE,
        orderBy: { [sortBy]: parseSortOrder(query.sortOrder ?? defaultOrder) },
        skip,
        take,
      }),
      this.prisma.hostelGatePass.count({ where }),
    ]);
    return {
      data: rows.map((r) => this.decorate(r, now)),
      pagination: buildMeta(total, page, limit),
    };
  }

  findAll(instituteId: string, query: QueryGatePassDto) {
    return this.page(query, this.listWhere(instituteId, query));
  }

  residentHistory(
    instituteId: string,
    residentId: number,
    query: QueryGatePassDto,
  ) {
    return this.page(
      query,
      this.listWhere(instituteId, { ...query, resident_id: residentId }),
    );
  }

  pending(instituteId: string, query: QueryGatePassDto) {
    return this.page(
      query,
      { ...this.listWhere(instituteId, query), status: 'pending' },
      'requested_out_at',
      'asc',
    );
  }

  /** Residents physically outside: status out or overdue. */
  outNow(instituteId: string, query: QueryGatePassDto) {
    return this.page(
      query,
      {
        ...this.listWhere(instituteId, query),
        status: { in: ['out', 'overdue'] },
      },
      'expected_return_at',
      'asc',
    );
  }

  /** Passes whose return time has gone by with the resident still outside — live, not dependent on the sweep. */
  static overdueWhere(
    instituteId: string,
    now: Date,
  ): Prisma.HostelGatePassWhereInput {
    return {
      institute_id: instituteId,
      actual_return_at: null,
      OR: [
        { status: 'overdue' },
        { status: 'out', expected_return_at: { lt: now } },
      ],
    };
  }

  overdue(instituteId: string, query: QueryGatePassDto) {
    return this.page(
      query,
      {
        AND: [
          this.listWhere(instituteId, { ...query, status: undefined }),
          GatePassesService.overdueWhere(instituteId, new Date()),
        ],
      },
      'expected_return_at',
      'asc',
    );
  }

  /** Passes touching today: out today, expected back today, or actually moved today. */
  today(instituteId: string, query: QueryGatePassDto) {
    const { start, end } = dayRange(localToday());
    const inDay = { gte: start, lt: end };
    return this.page(
      query,
      {
        AND: [
          this.listWhere(instituteId, {
            ...query,
            from: undefined,
            to: undefined,
          }),
          {
            OR: [
              { requested_out_at: inDay },
              { expected_return_at: inDay },
              { actual_out_at: inDay },
              { actual_return_at: inDay },
            ],
          },
        ],
      },
      'requested_out_at',
      'asc',
    );
  }

  // ─── Approval ─────────────────────────────────────────────────────────────

  async approve(actor: HostelPlatformUser, id: number, remarks?: string) {
    const pass = await this.prisma.$transaction(async (tx) => {
      const current = await this.lookup.lockGatePass(
        actor.institute_id,
        id,
        tx,
      );
      assertTransition(
        GATE_PASS_TRANSITIONS,
        current.status,
        'approved',
        'Gate pass',
      );
      if (current.expected_return_at <= new Date()) {
        throw new BusinessException(
          'PASS_WINDOW_ELAPSED',
          'The pass window has already ended; it can no longer be approved',
        );
      }
      const resident = await this.lookup.lockResident(
        actor.institute_id,
        current.resident_id,
        tx,
      );
      if (resident.status !== 'active') {
        throw new BusinessException(
          'RESIDENT_NOT_ACTIVE',
          `Resident is ${resident.status}; the pass cannot be approved`,
          { status: resident.status },
        );
      }
      await this.assertNoConflict(
        tx,
        current.resident_id,
        current.requested_out_at,
        current.expected_return_at,
        {
          exceptId: id,
          statuses: ['approved', 'out', 'overdue'],
          blockIfOut: false,
        },
      );
      return tx.hostelGatePass.update({
        where: { gate_pass_id: id },
        data: {
          status: 'approved',
          approved_by: actor.eddva_user_id,
          decided_at: new Date(),
          decision_remarks: remarks,
        },
        include: PASS_INCLUDE,
      });
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.GATE_PASS,
      entityId: String(id),
      action: 'approve',
      oldStatus: 'pending',
      newStatus: 'approved',
      reason: remarks,
    });
    await this.notifyGuardianOf(
      pass,
      'gate_pass_approved',
      `Gate pass ${pass.pass_no} for ${pass.resident.student_name} was approved (out ${pass.requested_out_at.toISOString()}, back ${pass.expected_return_at.toISOString()}).`,
    );
    return this.decorate(pass);
  }

  async reject(actor: HostelPlatformUser, id: number, remarks: string) {
    return this.closeUnused(
      actor,
      id,
      'rejected',
      remarks,
      'gate_pass_rejected',
    );
  }

  async cancel(actor: HostelPlatformUser, id: number, remarks?: string) {
    return this.closeUnused(
      actor,
      id,
      'cancelled',
      remarks,
      'gate_pass_cancelled',
    );
  }

  private async closeUnused(
    actor: HostelPlatformUser,
    id: number,
    to: 'rejected' | 'cancelled',
    remarks: string | undefined,
    eventType: string,
  ) {
    const { pass, from } = await this.prisma.$transaction(async (tx) => {
      const current = await this.lookup.lockGatePass(
        actor.institute_id,
        id,
        tx,
      );
      assertTransition(GATE_PASS_TRANSITIONS, current.status, to, 'Gate pass');
      const pass = await tx.hostelGatePass.update({
        where: { gate_pass_id: id },
        data: {
          status: to,
          ...(to === 'rejected' ? { rejected_by: actor.eddva_user_id } : {}),
          decided_at: new Date(),
          decision_remarks: remarks,
        },
        include: PASS_INCLUDE,
      });
      return { pass, from: current.status };
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.GATE_PASS,
      entityId: String(id),
      action: to === 'rejected' ? 'reject' : 'cancel',
      oldStatus: from,
      newStatus: to,
      reason: remarks,
    });
    await this.notifyGuardianOf(
      pass,
      eventType,
      `Gate pass ${pass.pass_no} for ${pass.resident.student_name} was ${to}${remarks ? `: ${remarks}` : '.'}`,
    );
    return this.decorate(pass);
  }

  // ─── Gate scanning ────────────────────────────────────────────────────────

  private assertScanMatchesPass(pass: PassWithResident, scan: GateScanDto) {
    if (
      scan.resident_id !== undefined &&
      scan.resident_id !== pass.resident_id
    ) {
      throw new BusinessException(
        'PASS_RESIDENT_MISMATCH',
        'This gate pass does not belong to the resident being scanned',
        undefined,
        HttpStatus.FORBIDDEN,
      );
    }
    if (
      scan.admission_no !== undefined &&
      (pass.resident.admission_no ?? '').toLowerCase() !==
        scan.admission_no.toLowerCase()
    ) {
      throw new BusinessException(
        'PASS_RESIDENT_MISMATCH',
        'This gate pass does not belong to the resident being scanned',
        undefined,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async passByNumber(
    instituteId: string,
    passNo: string,
  ): Promise<number> {
    const row = await this.prisma.hostelGatePass.findUnique({
      where: {
        institute_id_pass_no: { institute_id: instituteId, pass_no: passNo },
      },
      select: { gate_pass_id: true },
    });
    if (!row) throw new NotFoundException(`Gate pass ${passNo} not found`);
    return row.gate_pass_id;
  }

  scanOutByNumber(
    actor: HostelPlatformUser,
    passNo: string,
    scan: GateScanDto,
  ) {
    return this.passByNumber(actor.institute_id, passNo).then((id) =>
      this.scanOut(actor, id, scan),
    );
  }

  scanInByNumber(actor: HostelPlatformUser, passNo: string, scan: GateScanDto) {
    return this.passByNumber(actor.institute_id, passNo).then((id) =>
      this.scanIn(actor, id, scan),
    );
  }

  /**
   * Gate-verified departure. Only an approved, in-window pass of an active
   * resident can be used, exactly once.
   */
  async scanOut(actor: HostelPlatformUser, id: number, scan: GateScanDto) {
    const now = new Date();

    let outcome: { pass: PassWithResident; expired: boolean };
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        const current = await this.lookup.lockGatePass(
          actor.institute_id,
          id,
          tx,
        );
        const resident = await this.lookup.lockResident(
          actor.institute_id,
          current.resident_id,
          tx,
        );
        const full = await tx.hostelGatePass.findFirstOrThrow({
          where: { gate_pass_id: id },
          include: PASS_INCLUDE,
        });
        this.assertScanMatchesPass(full, scan);

        if (current.status === 'out' || current.status === 'overdue') {
          throw new BusinessException(
            'ALREADY_SCANNED_OUT',
            'This pass has already been scanned out',
            { actual_out_at: current.actual_out_at },
            HttpStatus.CONFLICT,
          );
        }
        if (current.status !== 'approved') {
          throw new BusinessException(
            current.status === 'pending'
              ? 'PASS_NOT_APPROVED'
              : 'PASS_NOT_VALID',
            current.status === 'pending'
              ? 'This pass has not been approved yet — the resident may not leave'
              : `This pass is ${current.status} and cannot be used to leave`,
            { status: current.status },
          );
        }
        if (resident.status !== 'active') {
          throw new BusinessException(
            'RESIDENT_NOT_ACTIVE',
            `Resident is ${resident.status} and may not leave on a pass`,
            { status: resident.status },
          );
        }
        if (current.expected_return_at <= now) {
          // Approved but never used, and the window is over. Record it, refuse the exit.
          await tx.hostelGatePass.update({
            where: { gate_pass_id: id },
            data: { status: 'expired' },
          });
          return { pass: full, expired: true };
        }
        if (
          now.getTime() <
          current.requested_out_at.getTime() -
            EARLY_SCAN_GRACE_MINUTES * MINUTE_MS
        ) {
          throw new BusinessException(
            'PASS_NOT_YET_VALID',
            `This pass is valid from ${current.requested_out_at.toISOString()}`,
            { requested_out_at: current.requested_out_at },
          );
        }

        // Conditional claim: only one scan can move approved → out.
        const claimed = await tx.hostelGatePass.updateMany({
          where: { gate_pass_id: id, status: 'approved' },
          data: {
            status: 'out',
            actual_out_at: now,
            scanned_out_by: actor.eddva_user_id,
          },
        });
        if (claimed.count === 0) {
          throw new BusinessException(
            'ALREADY_SCANNED_OUT',
            'This pass was just used',
            undefined,
            HttpStatus.CONFLICT,
          );
        }
        const pass = await tx.hostelGatePass.findFirstOrThrow({
          where: { gate_pass_id: id },
          include: PASS_INCLUDE,
        });
        return { pass, expired: false };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // hostel_gate_passes_one_out_per_resident_key: this resident is already outside on another pass.
        throw new BusinessException(
          'RESIDENT_ALREADY_OUT',
          'This resident is already outside on another gate pass',
          undefined,
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }

    const { pass, expired } = outcome;
    if (expired) {
      await this.audit.log(actor, {
        entityType: HOSTEL_ENTITY.GATE_PASS,
        entityId: String(id),
        action: 'expire',
        oldStatus: 'approved',
        newStatus: 'expired',
        reason: 'Scan-out attempted after the pass window ended',
      });
      throw new BusinessException(
        'PASS_EXPIRED',
        'This pass expired before it was used — the resident may not leave',
        { expected_return_at: pass.expected_return_at },
      );
    }

    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.GATE_PASS,
      entityId: String(id),
      action: 'scan_out',
      oldStatus: 'approved',
      newStatus: 'out',
      reason: scan.remarks,
      metadata: { actual_out_at: now, resident_id: pass.resident_id },
    });
    await this.notifyGuardianOf(
      pass,
      'resident_exited',
      `${pass.resident.student_name} left the hostel at ${now.toISOString()} on pass ${pass.pass_no}. Expected back by ${pass.expected_return_at.toISOString()}.`,
    );
    return this.decorate(pass);
  }

  /** Gate-verified return. A resident can only be scanned in against the pass they actually left on. */
  async scanIn(actor: HostelPlatformUser, id: number, scan: GateScanDto) {
    const now = new Date();
    const { pass, previous } = await this.prisma.$transaction(async (tx) => {
      const current = await this.lookup.lockGatePass(
        actor.institute_id,
        id,
        tx,
      );
      const full = await tx.hostelGatePass.findFirstOrThrow({
        where: { gate_pass_id: id },
        include: PASS_INCLUDE,
      });
      this.assertScanMatchesPass(full, scan);

      if (current.status === 'returned') {
        throw new BusinessException(
          'ALREADY_SCANNED_IN',
          'This pass has already been scanned in',
          { actual_return_at: current.actual_return_at },
          HttpStatus.CONFLICT,
        );
      }
      if (current.status !== 'out' && current.status !== 'overdue') {
        throw new BusinessException(
          'NOT_SCANNED_OUT',
          current.status === 'approved'
            ? 'This resident was never scanned out on this pass, so cannot be scanned in'
            : `This pass is ${current.status}; there is no departure to close`,
          { status: current.status },
        );
      }
      const claimed = await tx.hostelGatePass.updateMany({
        where: {
          gate_pass_id: id,
          status: { in: ['out', 'overdue'] },
          actual_return_at: null,
        },
        data: {
          status: 'returned',
          actual_return_at: now,
          scanned_in_by: actor.eddva_user_id,
        },
      });
      if (claimed.count === 0) {
        throw new BusinessException(
          'ALREADY_SCANNED_IN',
          'This pass was just scanned in',
          undefined,
          HttpStatus.CONFLICT,
        );
      }
      const pass = await tx.hostelGatePass.findFirstOrThrow({
        where: { gate_pass_id: id },
        include: PASS_INCLUDE,
      });
      return { pass, previous: current.status };
    });

    const lateMinutes = Math.max(
      0,
      Math.floor(
        (now.getTime() - pass.expected_return_at.getTime()) / MINUTE_MS,
      ),
    );
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.GATE_PASS,
      entityId: String(id),
      action: 'scan_in',
      oldStatus: previous,
      newStatus: 'returned',
      reason: scan.remarks,
      metadata: {
        actual_return_at: now,
        late_by_minutes: lateMinutes,
        resident_id: pass.resident_id,
      },
    });
    await this.notifyGuardianOf(
      pass,
      'resident_returned',
      `${pass.resident.student_name} returned to the hostel at ${now.toISOString()}${lateMinutes > 0 ? ` (${lateMinutes} min late)` : ''}.`,
    );
    return {
      ...this.decorate(pass, now),
      returned_late: lateMinutes > 0,
      late_by_minutes: lateMinutes,
    };
  }

  // ─── Sweeps (called by HostelScheduler; safe to run at any time, any number of times) ───

  /**
   * out → overdue for every pass whose return time has gone by. The UPDATE only
   * matches rows still `out` with no actual return, so a pass is processed once
   * and a pass that has been scanned in can never become overdue.
   */
  async markOverduePasses(now: Date = new Date()): Promise<number> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        gate_pass_id: number;
        institute_id: string;
        resident_id: number;
        pass_no: string;
        expected_return_at: Date;
      }>
    >`
      UPDATE hostel_gate_passes
      SET status = 'overdue', overdue_at = ${now}, overdue_notified_at = ${now}, updated_at = ${now}
      WHERE status = 'out' AND actual_return_at IS NULL AND expected_return_at < ${now}
      RETURNING gate_pass_id, institute_id, resident_id, pass_no, expected_return_at
    `;
    if (rows.length === 0) return 0;

    const residents = await this.prisma.hostelResident.findMany({
      where: {
        resident_id: { in: [...new Set(rows.map((r) => r.resident_id))] },
      },
      select: {
        resident_id: true,
        student_name: true,
        guardian_phone: true,
        guardian_email: true,
        allotments: {
          where: { status: 'active' },
          take: 1,
          select: {
            room: { select: { block: { select: { warden_user_id: true } } } },
          },
        },
      },
    });
    const byId = new Map(residents.map((r) => [r.resident_id, r]));

    for (const row of rows) {
      const resident = byId.get(row.resident_id);
      const late = Math.floor(
        (now.getTime() - row.expected_return_at.getTime()) / MINUTE_MS,
      );
      const message = `${resident?.student_name ?? 'A resident'} has not returned on pass ${row.pass_no} (${late} min overdue).`;
      await this.audit.log(undefined, {
        entityType: HOSTEL_ENTITY.GATE_PASS,
        entityId: String(row.gate_pass_id),
        action: 'mark_overdue',
        oldStatus: 'out',
        newStatus: 'overdue',
        metadata: {
          pass_no: row.pass_no,
          resident_id: row.resident_id,
          overdue_by_minutes: late,
        },
      });
      await this.notifications.notifyStaff(
        {
          instituteId: row.institute_id,
          entityType: HOSTEL_ENTITY.GATE_PASS,
          entityId: row.gate_pass_id,
          eventType: 'gate_pass_overdue',
          message,
        },
        // the block's warden, plus the institute-wide (null) channel for admins
        [resident?.allotments[0]?.room.block.warden_user_id ?? null, null],
      );
      if (resident) {
        await this.notifications.notifyGuardian(
          {
            instituteId: row.institute_id,
            entityType: HOSTEL_ENTITY.GATE_PASS,
            entityId: row.gate_pass_id,
            eventType: 'gate_pass_overdue',
            message,
          },
          resident,
        );
      }
    }
    this.logger.warn(`Marked ${rows.length} gate pass(es) overdue`);
    return rows.length;
  }

  /** Passes never used (pending/approved) whose window is over are closed as `expired`. */
  async expireUnusedPasses(now: Date = new Date()): Promise<number> {
    const rows = await this.prisma.$queryRaw<
      Array<{ gate_pass_id: number; status: string }>
    >`
      UPDATE hostel_gate_passes
      SET status = 'expired', updated_at = ${now}
      WHERE status IN ('pending', 'approved') AND expected_return_at < ${now}
      RETURNING gate_pass_id, status
    `;
    for (const row of rows) {
      await this.audit.log(undefined, {
        entityType: HOSTEL_ENTITY.GATE_PASS,
        entityId: String(row.gate_pass_id),
        action: 'expire',
        newStatus: 'expired',
        reason: 'Pass window ended without the pass being used',
      });
    }
    return rows.length;
  }

  private notifyGuardianOf(
    pass: PassWithResident & { institute_id: string },
    eventType: string,
    message: string,
  ) {
    return this.notifications.notifyGuardian(
      {
        instituteId: pass.institute_id,
        entityType: HOSTEL_ENTITY.GATE_PASS,
        entityId: pass.gate_pass_id,
        eventType,
        message,
      },
      pass.resident,
    );
  }
}
