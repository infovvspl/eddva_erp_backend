import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StaffType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { QueryLeaveBalanceDto } from './dto/query-leave-balance.dto';

interface BalanceKey {
  staff_id: number;
  leave_type_id: number;
}

function keyOf(b: BalanceKey): string {
  return `${b.staff_id}:${b.leave_type_id}`;
}

/**
 * Leave balance accrual — idempotent by design (unique on staff_id+leave_type_id+year,
 * backed by `skipDuplicates`), so it never matters whether this runs once, is
 * re-triggered manually, or is re-run by the daily sweep: missing rows get
 * created, existing rows are left untouched (balances, once allocated for a
 * year, are never silently re-computed — only a leave application, in Phase C,
 * changes `used_days`).
 */
@Injectable()
export class LeaveBalancesService {
  private readonly logger = new Logger(LeaveBalancesService.name);

  constructor(private readonly prisma: PrismaService) {}

  currentYear(): number {
    return new Date().getUTCFullYear();
  }

  async findAll(instituteId: string, query: QueryLeaveBalanceDto) {
    return this.prisma.leaveBalance.findMany({
      where: {
        institute_id: requireInstituteId(instituteId),
        staff_id: query.staff_id,
        year: query.year ?? this.currentYear(),
      },
      include: { leave_type: true, staff: { select: { staff_id: true, full_name: true, staff_code: true } } },
      orderBy: [{ staff_id: 'asc' }, { leave_type_id: 'asc' }],
    });
  }

  async findForStaff(instituteId: string, staffId: number, year?: number) {
    const institute_id = requireInstituteId(instituteId);
    const staff = await this.prisma.staffMember.findFirst({
      where: { staff_id: staffId, institute_id },
    });
    if (!staff) throw new NotFoundException(`Staff member #${staffId} not found`);

    return this.prisma.leaveBalance.findMany({
      where: { staff_id: staffId, institute_id, year: year ?? this.currentYear() },
      include: { leave_type: true },
      orderBy: { leave_type_id: 'asc' },
    });
  }

  /**
   * Computes and inserts the missing (staff x applicable leave type) balance
   * rows for one institute and year. Returns the number of rows attempted
   * (an upper bound — `skipDuplicates` may insert fewer if some already exist).
   */
  async ensureBalancesForInstitute(instituteId: string, year: number = this.currentYear()): Promise<number> {
    const institute_id = requireInstituteId(instituteId);

    const [staffMembers, leaveTypes] = await Promise.all([
      this.prisma.staffMember.findMany({
        where: { institute_id, status: 'active' },
        select: { staff_id: true, staff_type: true },
      }),
      this.prisma.leaveType.findMany({
        where: { institute_id, is_active: true },
      }),
    ]);

    if (staffMembers.length === 0 || leaveTypes.length === 0) return 0;

    const [existingThisYear, previousYearBalances] = await Promise.all([
      this.prisma.leaveBalance.findMany({
        where: { institute_id, year },
        select: { staff_id: true, leave_type_id: true },
      }),
      this.prisma.leaveBalance.findMany({
        where: { institute_id, year: year - 1 },
        select: { staff_id: true, leave_type_id: true, allocated_days: true, used_days: true },
      }),
    ]);

    const existingKeys = new Set(existingThisYear.map(keyOf));
    const prevMap = new Map(previousYearBalances.map((b) => [keyOf(b), b]));

    const appliesTo = (leaveTypeStaffType: StaffType | null, staffStaffType: StaffType) =>
      leaveTypeStaffType === null || leaveTypeStaffType === staffStaffType;

    const rows: Array<{
      institute_id: string;
      staff_id: number;
      leave_type_id: number;
      year: number;
      allocated_days: number;
    }> = [];

    for (const staff of staffMembers) {
      for (const leaveType of leaveTypes) {
        if (!appliesTo(leaveType.applicable_staff_type, staff.staff_type)) continue;
        const key = keyOf({ staff_id: staff.staff_id, leave_type_id: leaveType.leave_type_id });
        if (existingKeys.has(key)) continue;

        let carriedForward = 0;
        if (leaveType.allow_carry_forward) {
          const prev = prevMap.get(key);
          if (prev) {
            const available = Number(prev.allocated_days) - Number(prev.used_days);
            carriedForward = Math.max(0, available);
            if (leaveType.max_carry_forward_days != null) {
              carriedForward = Math.min(carriedForward, Number(leaveType.max_carry_forward_days));
            }
          }
        }

        rows.push({
          institute_id,
          staff_id: staff.staff_id,
          leave_type_id: leaveType.leave_type_id,
          year,
          allocated_days: Number(leaveType.annual_quota_days) + carriedForward,
        });
      }
    }

    if (rows.length === 0) return 0;

    await this.prisma.leaveBalance.createMany({ data: rows, skipDuplicates: true });
    this.logger.log(`Leave balances ensured for ${institute_id} (${year}): ${rows.length} row(s)`);
    return rows.length;
  }

  /** Scoped convenience — called right after a staff member is created or reinstated, so they don't wait for the next daily sweep. */
  async ensureBalancesForStaffMember(instituteId: string, staffId: number, staffType: StaffType, year: number = this.currentYear()): Promise<number> {
    const institute_id = requireInstituteId(instituteId);
    const leaveTypes = await this.prisma.leaveType.findMany({ where: { institute_id, is_active: true } });
    const applicable = leaveTypes.filter((lt) => lt.applicable_staff_type === null || lt.applicable_staff_type === staffType);
    if (applicable.length === 0) return 0;

    const rows = applicable.map((lt) => ({
      institute_id,
      staff_id: staffId,
      leave_type_id: lt.leave_type_id,
      year,
      allocated_days: Number(lt.annual_quota_days),
    }));

    const result = await this.prisma.leaveBalance.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  }

  /** Cross-institute sweep for the daily scheduler. */
  async ensureBalancesForAllInstitutes(year: number = this.currentYear()): Promise<number> {
    const institutes = await this.prisma.staffMember.findMany({
      distinct: ['institute_id'],
      select: { institute_id: true },
    });
    let total = 0;
    for (const { institute_id } of institutes) {
      total += await this.ensureBalancesForInstitute(institute_id, year);
    }
    return total;
  }
}
