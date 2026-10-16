import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { StaffAuditService } from '../common/staff-audit.service';
import { STAFF_ENTITY } from '../common/staff-entities';
import { BusinessException } from '../common/business-exception';
import { StaffPlatformUser } from '../auth/staff-auth.service';
import { AutoPostingService } from '../../accounts/auto-posting/auto-posting.service';
import { StaffNotificationService } from '../notifications/staff-notification.service';
import { GeneratePayrollRunDto } from './dto/generate-payroll-run.dto';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Inclusive day count between two calendar dates, never negative. */
function inclusiveDayCount(from: Date, to: Date): number {
  if (to < from) return 0;
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY) + 1;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

@Injectable()
export class PayrollRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: StaffAuditService,
    private readonly autoPosting: AutoPostingService,
    private readonly notifications: StaffNotificationService,
  ) {}

  /**
   * Snapshots each active staff member's in-force salary structure and
   * unpaid-leave days for the month into one Payslip. Never re-run for a
   * month that already has one — a correction means fixing the underlying
   * data (salary structure, leave record) and generating fresh, not
   * silently recomputing a run that may already have been reviewed or paid.
   */
  async generate(actor: StaffPlatformUser, dto: GeneratePayrollRunDto) {
    const institute_id = requireInstituteId(actor.institute_id);

    const existing = await this.prisma.payrollRun.findUnique({
      where: { institute_id_month_year: { institute_id, month: dto.month, year: dto.year } },
    });
    if (existing) {
      throw new BusinessException(
        'PAYROLL_RUN_EXISTS',
        `A payroll run for ${dto.month}/${dto.year} already exists (#${existing.run_id})`,
        { run_id: existing.run_id },
        HttpStatus.CONFLICT,
      );
    }

    const monthStart = new Date(Date.UTC(dto.year, dto.month - 1, 1));
    const monthEnd = new Date(Date.UTC(dto.year, dto.month, 0));
    const daysInMonth = monthEnd.getUTCDate();

    const activeStaff = await this.prisma.staffMember.findMany({
      where: { institute_id, status: 'active' },
      select: { staff_id: true },
    });

    if (activeStaff.length === 0) {
      return this.prisma.payrollRun.create({
        data: { institute_id, month: dto.month, year: dto.year, generated_by: actor.eddva_user_id },
      });
    }
    const activeStaffIds = activeStaff.map((s) => s.staff_id);

    const [structures, leaveApps] = await Promise.all([
      this.prisma.staffSalaryStructure.findMany({
        where: {
          institute_id,
          staff_id: { in: activeStaffIds },
          effective_from: { lte: monthEnd },
          OR: [{ effective_to: null }, { effective_to: { gte: monthEnd } }],
        },
        orderBy: { effective_from: 'asc' },
      }),
      this.prisma.leaveApplication.findMany({
        where: {
          institute_id,
          staff_id: { in: activeStaffIds },
          status: 'approved',
          leave_type: { is_paid: false },
          from_date: { lte: monthEnd },
          to_date: { gte: monthStart },
        },
        select: { staff_id: true, from_date: true, to_date: true },
      }),
    ]);

    // Last write wins — orderBy effective_from asc means the latest (most
    // recent) structure in force for the month ends up as the map's value.
    const structureByStaff = new Map(structures.map((s) => [s.staff_id, s]));

    const lopDaysByStaff = new Map<number, number>();
    for (const app of leaveApps) {
      const overlapStart = app.from_date > monthStart ? app.from_date : monthStart;
      const overlapEnd = app.to_date < monthEnd ? app.to_date : monthEnd;
      const days = inclusiveDayCount(overlapStart, overlapEnd);
      lopDaysByStaff.set(app.staff_id, (lopDaysByStaff.get(app.staff_id) ?? 0) + days);
    }

    const payslipRows: Array<{
      institute_id: string;
      run_id: number;
      staff_id: number;
      basic_salary: number;
      allowances_total: number;
      gross_salary: number;
      lop_days: number;
      lop_amount: number;
      other_deductions: number;
      net_salary: number;
    }> = [];
    const skipped: Array<{ staff_id: number; reason: string }> = [];

    for (const staffId of activeStaffIds) {
      const structure = structureByStaff.get(staffId);
      if (!structure) {
        skipped.push({ staff_id: staffId, reason: 'NO_SALARY_STRUCTURE' });
        continue;
      }
      const basic = Number(structure.basic_salary);
      const allowances = (structure.allowances ?? {}) as Record<string, number>;
      const allowancesTotal = Object.values(allowances).reduce((sum, v) => sum + Number(v || 0), 0);
      const deductions = (structure.deductions ?? {}) as Record<string, number>;
      const deductionsTotal = Object.values(deductions).reduce((sum, v) => sum + Number(v || 0), 0);
      const gross = basic + allowancesTotal;
      const perDayRate = gross / daysInMonth;
      const lopDays = lopDaysByStaff.get(staffId) ?? 0;
      const lopAmount = round2(lopDays * perDayRate);
      const net = round2(gross - lopAmount - deductionsTotal);

      payslipRows.push({
        institute_id,
        run_id: -1, // placeholder, filled in after the run is created
        staff_id: staffId,
        basic_salary: basic,
        allowances_total: round2(allowancesTotal),
        gross_salary: round2(gross),
        lop_days: lopDays,
        lop_amount: lopAmount,
        other_deductions: round2(deductionsTotal),
        net_salary: net,
      });
    }

    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payrollRun.create({
        data: { institute_id, month: dto.month, year: dto.year, generated_by: actor.eddva_user_id },
      });
      if (payslipRows.length > 0) {
        await tx.payslip.createMany({
          data: payslipRows.map((row) => ({ ...row, run_id: created.run_id })),
        });
      }
      return created;
    });

    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.PAYROLL_RUN,
      entityId: String(run.run_id),
      action: 'generate',
      metadata: { payslips_created: payslipRows.length, skipped },
    });

    return { ...run, payslips_created: payslipRows.length, skipped };
  }

  async findAll(instituteId: string, year?: number) {
    return this.prisma.payrollRun.findMany({
      where: { institute_id: requireInstituteId(instituteId), year },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async findOne(instituteId: string, id: number) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { run_id: id, institute_id: requireInstituteId(instituteId) },
      include: {
        payslips: {
          include: { staff: { select: { staff_id: true, full_name: true, staff_code: true, lms_user_id: true } } },
          orderBy: { staff_id: 'asc' },
        },
      },
    });
    if (!run) throw new NotFoundException(`Payroll run #${id} not found`);
    return run;
  }

  async finalize(actor: StaffPlatformUser, id: number) {
    const institute_id = requireInstituteId(actor.institute_id);
    const run = await this.findOne(institute_id, id);
    if (run.status !== 'draft') {
      throw new BusinessException(
        'PAYROLL_RUN_NOT_DRAFT',
        `Payroll run #${id} is ${run.status}, not draft`,
        undefined,
        HttpStatus.CONFLICT,
      );
    }

    const updated = await this.prisma.payrollRun.update({
      where: { run_id: id },
      data: { status: 'finalized', finalized_by: actor.eddva_user_id, finalized_at: new Date() },
    });

    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.PAYROLL_RUN,
      entityId: String(id),
      action: 'finalize',
      oldStatus: 'draft',
      newStatus: updated.status,
    });
    return updated;
  }

  /** Marks the run paid and posts each payslip's net salary to the ledger. */
  async markPaid(actor: StaffPlatformUser, id: number) {
    const institute_id = requireInstituteId(actor.institute_id);
    const run = await this.findOne(institute_id, id);
    if (run.status !== 'finalized') {
      throw new BusinessException(
        'PAYROLL_RUN_NOT_FINALIZED',
        `Payroll run #${id} is ${run.status}, not finalized`,
        undefined,
        HttpStatus.CONFLICT,
      );
    }

    const payDate = new Date();
    const monthLabel = `${MONTH_NAMES[run.month - 1]} ${run.year}`;
    for (const payslip of run.payslips) {
      await this.autoPosting.postPayrollDisbursement({
        instituteId: institute_id,
        payslipId: payslip.payslip_id,
        staffId: payslip.staff_id,
        payDate,
        netSalary: Number(payslip.net_salary),
        userId: actor.eddva_user_id,
      });

      // Only notify when we know the teacher's own LMS login (set on their
      // first self-service login or push-sync). Unlike other
      // StaffNotificationService calls, a null recipient here must NOT fall
      // back to an institute-wide broadcast — that would leak one person's
      // salary amount to every staff member viewing their own notifications
      // (findForRecipient treats recipient=null as "visible to everyone").
      if (payslip.staff.lms_user_id) {
        await this.notifications.notify(
          {
            instituteId: institute_id,
            entityType: STAFF_ENTITY.PAYROLL_RUN,
            entityId: id,
            eventType: 'salary_paid',
            message: `Your salary for ${monthLabel} has been paid: ₹${Number(payslip.net_salary).toLocaleString('en-IN')} net.`,
          },
          [payslip.staff.lms_user_id],
        );
      }
    }

    const updated = await this.prisma.payrollRun.update({
      where: { run_id: id },
      data: { status: 'paid', paid_by: actor.eddva_user_id, paid_at: payDate },
    });

    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.PAYROLL_RUN,
      entityId: String(id),
      action: 'mark_paid',
      oldStatus: 'finalized',
      newStatus: updated.status,
    });
    return updated;
  }
}
