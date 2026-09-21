import {
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAuditService } from '../common/hostel-audit.service';
import { HostelLookupService } from '../common/hostel-lookup.service';
import { HostelNumberingService } from '../common/hostel-numbering.service';
import { HostelNotificationService } from '../notifications/hostel-notification.service';
import { HOSTEL_ENTITY } from '../common/hostel-entities';
import { BusinessException } from '../common/business-exception';
import { isUniqueViolation } from '../common/unique-violation.util';
import { dateOnlyString, localToday, parseDateOnly } from '../common/time.util';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
  parseSort,
  parseSortOrder,
} from '../common/pagination.util';
import { billingPeriodFor, defaultDueDate } from './billing-period.util';
import {
  CancelHostelInvoiceDto,
  GenerateHostelInvoiceDto,
  QueryHostelInvoiceDto,
} from './dto/fee.dto';

const SORT_FIELDS = [
  'period_start',
  'due_date',
  'amount_due',
  'created_at',
  'invoice_no',
] as const;

const INVOICE_INCLUDE = {
  resident: {
    select: { resident_id: true, student_name: true, admission_no: true },
  },
} satisfies Prisma.HostelFeeInvoiceInclude;

type InvoiceRow = Prisma.HostelFeeInvoiceGetPayload<{
  include: typeof INVOICE_INCLUDE;
}>;

export type InvoiceView = ReturnType<InvoicesService['present']>;

/** Invoices whose money is still owed (not cancelled, not fully paid). */
export const OUTSTANDING: Prisma.HostelFeeInvoiceWhereInput = {
  cancelled_at: null,
  payment_status: { in: ['unpaid', 'partially_paid'] },
};

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: HostelLookupService,
    private readonly numbering: HostelNumberingService,
    private readonly audit: HostelAuditService,
    private readonly notifications: HostelNotificationService,
  ) {}

  /** Adds the derived balance and overdue flag; amounts are Decimal(12,2) and serialise as strings. */
  present(row: InvoiceRow, today = localToday()) {
    const balance = row.amount_due.minus(row.amount_paid);
    const outstanding = !row.cancelled_at && balance.gt(0);
    return {
      ...row,
      balance: balance.toFixed(2),
      is_overdue: outstanding && row.due_date < today,
    };
  }

  async generate(actor: HostelPlatformUser, dto: GenerateHostelInvoiceDto) {
    const resident = await this.lookup.resident(
      actor.institute_id,
      dto.resident_id,
    );
    const plan = await this.lookup.feePlan(actor.institute_id, dto.fee_plan_id);
    if (!plan.is_active) {
      throw new BusinessException(
        'FEE_PLAN_INACTIVE',
        `Fee plan "${plan.name}" is inactive; activate it or choose another`,
      );
    }
    const period = billingPeriodFor(
      plan.billing_cycle,
      dto.billing_period_start,
    );
    if (resident.vacated_on && period.start > resident.vacated_on) {
      throw new BusinessException(
        'RESIDENT_NOT_ACTIVE',
        'Resident vacated before this billing period started',
        { vacated_on: dateOnlyString(resident.vacated_on) },
      );
    }

    // The plan is per room type: a resident in a triple room must not be billed a single-room plan.
    const placement = await this.prisma.hostelRoomAllotment.findFirst({
      where: { resident_id: resident.resident_id, status: 'active' },
      select: { room: { select: { room_type: true } } },
    });
    if (placement && placement.room.room_type !== plan.room_type) {
      throw new BusinessException(
        'FEE_PLAN_ROOM_TYPE_MISMATCH',
        `Resident lives in a ${placement.room.room_type} room but the plan is for ${plan.room_type}`,
        {
          resident_room_type: placement.room.room_type,
          plan_room_type: plan.room_type,
        },
      );
    }

    const due = dto.due_date
      ? parseDateOnly(dto.due_date, 'due_date')
      : defaultDueDate(period.start);
    if (due < period.start) {
      throw new BusinessException(
        'INVALID_DUE_DATE',
        'due_date cannot be before the billing period starts',
      );
    }

    let invoice: InvoiceRow;
    try {
      invoice = await this.prisma.$transaction(async (tx) => {
        const invoice_no = await this.numbering.next('INVOICE', tx);
        return tx.hostelFeeInvoice.create({
          data: {
            institute_id: actor.institute_id,
            invoice_no,
            resident_id: resident.resident_id,
            fee_plan_id: plan.fee_plan_id,
            // Snapshot: later plan edits must never change an issued invoice.
            plan_name: plan.name,
            room_type: plan.room_type,
            includes_mess: plan.includes_mess,
            billing_cycle: plan.billing_cycle,
            amount_due: plan.amount,
            billing_period: period.label,
            period_start: period.start,
            period_end: period.end,
            issued_on: localToday(),
            due_date: due,
            remarks: dto.remarks,
            created_by: actor.eddva_user_id,
          },
          include: INVOICE_INCLUDE,
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `${resident.student_name} already has an invoice for ${period.label}. Cancel it first if it was raised in error.`,
        );
      }
      throw err;
    }

    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.INVOICE,
      entityId: String(invoice.invoice_id),
      action: 'generate',
      newStatus: 'unpaid',
      metadata: {
        invoice_no: invoice.invoice_no,
        resident_id: invoice.resident_id,
        billing_period: invoice.billing_period,
        amount_due: invoice.amount_due.toString(),
      },
    });
    await this.notifications.notifyGuardian(
      {
        instituteId: actor.institute_id,
        entityType: HOSTEL_ENTITY.INVOICE,
        entityId: invoice.invoice_id,
        eventType: 'fee_invoice_generated',
        message: `Hostel fee invoice ${invoice.invoice_no} for ${resident.student_name}: ${invoice.amount_due.toFixed(2)} for ${invoice.billing_period}, due ${dateOnlyString(invoice.due_date)}.`,
      },
      resident,
    );
    return this.present(invoice);
  }

  private where(
    instituteId: string,
    query: QueryHostelInvoiceDto,
  ): Prisma.HostelFeeInvoiceWhereInput {
    const range = buildDateRange(query.from, query.to);
    return {
      institute_id: instituteId,
      resident_id: query.resident_id,
      payment_status: query.payment_status,
      billing_period: query.billing_period,
      billing_cycle: query.billing_cycle,
      ...(query.include_cancelled ? {} : { cancelled_at: null }),
      ...(range ? { period_start: range } : {}),
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
              { invoice_no: { contains: query.search, mode: 'insensitive' } },
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
    query: QueryHostelInvoiceDto,
    where: Prisma.HostelFeeInvoiceWhereInput,
    defaultSort: (typeof SORT_FIELDS)[number] = 'period_start',
    defaultOrder: 'asc' | 'desc' = 'desc',
  ) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, defaultSort);
    const today = localToday();
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.hostelFeeInvoice.findMany({
        where,
        include: INVOICE_INCLUDE,
        orderBy: { [sortBy]: parseSortOrder(query.sortOrder ?? defaultOrder) },
        skip,
        take,
      }),
      this.prisma.hostelFeeInvoice.count({ where }),
    ]);
    return {
      data: rows.map((r) => this.present(r, today)),
      pagination: buildMeta(total, page, limit),
    };
  }

  findAll(instituteId: string, query: QueryHostelInvoiceDto) {
    return this.page(query, this.where(instituteId, query));
  }

  async residentInvoices(
    instituteId: string,
    residentId: number,
    query: QueryHostelInvoiceDto,
  ) {
    await this.lookup.resident(instituteId, residentId);
    return this.page(
      query,
      this.where(instituteId, { ...query, resident_id: residentId }),
    );
  }

  outstanding(instituteId: string, query: QueryHostelInvoiceDto) {
    return this.page(
      query,
      {
        AND: [
          this.where(instituteId, { ...query, payment_status: undefined }),
          OUTSTANDING,
        ],
      },
      'due_date',
      'asc',
    );
  }

  /** Owed and not yet past the due date. */
  due(instituteId: string, query: QueryHostelInvoiceDto) {
    return this.page(
      query,
      {
        AND: [
          this.where(instituteId, { ...query, payment_status: undefined }),
          OUTSTANDING,
          { due_date: { gte: localToday() } },
        ],
      },
      'due_date',
      'asc',
    );
  }

  /** Owed and past the due date. */
  overdue(instituteId: string, query: QueryHostelInvoiceDto) {
    return this.page(
      query,
      {
        AND: [
          this.where(instituteId, { ...query, payment_status: undefined }),
          OUTSTANDING,
          { due_date: { lt: localToday() } },
        ],
      },
      'due_date',
      'asc',
    );
  }

  async findOne(instituteId: string, id: number) {
    await this.lookup.invoice(instituteId, id);
    const row = await this.prisma.hostelFeeInvoice.findFirstOrThrow({
      where: { invoice_id: id },
      include: {
        ...INVOICE_INCLUDE,
        payments: { orderBy: { payment_id: 'asc' } },
      },
    });
    return this.present(row);
  }

  /** Only an invoice nobody has paid against can be cancelled — money already taken needs a refund flow, not a void. */
  async cancel(
    actor: HostelPlatformUser,
    id: number,
    dto: CancelHostelInvoiceDto,
  ) {
    await this.lookup.invoice(actor.institute_id, id);
    await this.prisma.$transaction(async (tx) => {
      const invoice = await this.lookup.lockInvoice(actor.institute_id, id, tx);
      if (invoice.cancelled_at) {
        throw new BusinessException(
          'INVOICE_ALREADY_CANCELLED',
          'Invoice is already cancelled',
          undefined,
          HttpStatus.CONFLICT,
        );
      }
      if (invoice.amount_paid.gt(0)) {
        throw new BusinessException(
          'INVOICE_HAS_PAYMENTS',
          'Payments have been recorded against this invoice, so it cannot be cancelled',
          { amount_paid: invoice.amount_paid.toFixed(2) },
          HttpStatus.CONFLICT,
        );
      }
      await tx.hostelFeeInvoice.update({
        where: { invoice_id: id },
        data: {
          cancelled_at: new Date(),
          cancelled_by: actor.eddva_user_id,
          cancel_reason: dto.reason,
        },
      });
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.INVOICE,
      entityId: String(id),
      action: 'cancel',
      reason: dto.reason,
    });
    return this.findOne(actor.institute_id, id);
  }

  /**
   * Daily sweep: one "fee overdue" notice per invoice. `overdue_notified_at`
   * is claimed with a conditional update, so re-running the job never repeats
   * a notice, and paying (or cancelling) an invoice removes it from the sweep.
   */
  async notifyOverdueInvoices(today: Date = localToday()): Promise<number> {
    const rows = await this.prisma.hostelFeeInvoice.findMany({
      where: {
        ...OUTSTANDING,
        due_date: { lt: today },
        overdue_notified_at: null,
      },
      include: {
        resident: {
          select: {
            student_name: true,
            guardian_phone: true,
            guardian_email: true,
          },
        },
      },
      take: 1000,
    });
    if (rows.length === 0) return 0;
    const claimed = await this.prisma.hostelFeeInvoice.updateMany({
      where: {
        invoice_id: { in: rows.map((r) => r.invoice_id) },
        overdue_notified_at: null,
      },
      data: { overdue_notified_at: new Date() },
    });
    if (claimed.count === 0) return 0;
    for (const row of rows) {
      await this.notifications.notifyGuardian(
        {
          instituteId: row.institute_id,
          entityType: HOSTEL_ENTITY.INVOICE,
          entityId: row.invoice_id,
          eventType: 'fee_overdue',
          message: `Hostel fee invoice ${row.invoice_no} for ${row.resident.student_name} was due on ${dateOnlyString(row.due_date)}; balance ${row.amount_due.minus(row.amount_paid).toFixed(2)}.`,
        },
        row.resident,
      );
    }
    this.logger.log(`Queued ${claimed.count} overdue-fee notice(s)`);
    return claimed.count;
  }
}
