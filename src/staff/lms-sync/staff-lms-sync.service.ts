import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Give up automatic retries after this many failed pushes; an admin can still retry manually. */
export const STAFF_LMS_SYNC_MAX_ATTEMPTS = 10;
const REQUEST_TIMEOUT_MS = 15_000;

export interface StaffLmsSyncOutcome {
  staff_id: number;
  status: 'synced' | 'skipped' | 'failed';
  message?: string;
}

/**
 * One-way push: teaching staff only, mirrors admission/alumni's lms-sync
 * exactly. A new teaching-staff member becomes an LMS teacher login; never
 * throws into the directory flow — a failed push leaves the member `pending`
 * with the error recorded, and the scheduler / admin retry picks it up.
 * Reuses the same LMS_BASE_URL / INTERNAL_API_KEY as admission and alumni —
 * the LMS exposes one internal API for all three.
 */
@Injectable()
export class StaffLmsSyncService {
  private readonly logger = new Logger(StaffLmsSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  private config() {
    const baseUrl = process.env.LMS_BASE_URL?.replace(/\/+$/, '');
    const key = process.env.INTERNAL_API_KEY;
    const instituteId = process.env.LMS_INSTITUTE_ID?.trim();
    return baseUrl && key ? { baseUrl, key, instituteId } : null;
  }

  /** Fire-and-forget entry point for the directory flow. */
  trigger(staffId: number): void {
    this.sync(staffId).catch((err) =>
      this.logger.error(`Staff LMS sync crashed for #${staffId}`, err as Error),
    );
  }

  async sync(staffId: number): Promise<StaffLmsSyncOutcome> {
    const cfg = this.config();
    if (!cfg) {
      return { staff_id: staffId, status: 'skipped', message: 'LMS_BASE_URL / INTERNAL_API_KEY not configured' };
    }

    const staff = await this.prisma.staffMember.findUnique({
      where: { staff_id: staffId },
      include: { department: true },
    });
    if (!staff || staff.staff_type !== 'teaching' || staff.lms_sync_status !== 'pending') {
      return { staff_id: staffId, status: 'skipped', message: 'Not a pending teaching-staff member' };
    }
    if (!staff.email) {
      return { staff_id: staffId, status: 'skipped', message: 'No email on file — the LMS requires one to create a login' };
    }

    try {
      const res = await fetch(`${cfg.baseUrl}/internal/erp/teachers`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-key': cfg.key,
        },
        body: JSON.stringify({
          // See lms-sync.service.ts (admission) for why this precedence
          // flipped: the record's own institute_id is now the real LMS id
          // for SSO-provisioned institutes, so it takes priority over the
          // single-tenant env var fallback. All three instituteId sites in
          // this file use the same precedence so a later status/department
          // push always agrees with what sync() originally used.
          instituteId: staff.institute_id || cfg.instituteId,
          employeeId: staff.staff_code,
          name: staff.full_name,
          email: staff.email,
          phone: staff.phone ?? undefined,
          department: staff.department?.name,
          designation: staff.designation,
          joiningDate: staff.date_of_joining.toISOString().slice(0, 10),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = body?.message?.message ?? body?.message ?? res.statusText;
        throw new Error(`LMS ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
      }
      const teacherRef = String(body.teacherId ?? body.data?.teacherId ?? '');
      if (!teacherRef) throw new Error('LMS response had no teacherId');
      const lmsUserId = body.userId ?? body.data?.userId;

      // Guarded like the admission/alumni sync: only a still-pending member is flipped.
      await this.prisma.staffMember.updateMany({
        where: { staff_id: staffId, lms_sync_status: 'pending' },
        data: {
          lms_teacher_ref: teacherRef,
          lms_user_id: lmsUserId ? String(lmsUserId) : undefined,
          lms_sync_status: 'synced',
          lms_sync_error: null,
          lms_last_attempt_at: new Date(),
          lms_sync_attempts: { increment: 1 },
        },
      });
      return { staff_id: staffId, status: 'synced' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Staff LMS sync failed for #${staffId}: ${message}`);
      await this.prisma.staffMember.update({
        where: { staff_id: staffId },
        data: {
          lms_sync_error: message.slice(0, 500),
          lms_last_attempt_at: new Date(),
          lms_sync_attempts: { increment: 1 },
        },
      });
      return { staff_id: staffId, status: 'failed', message };
    }
  }

  /** Re-pushes teaching staff still waiting for their LMS teacher login. */
  async retryPending(limit = 50): Promise<number> {
    if (!this.config()) return 0;
    const rows = await this.prisma.staffMember.findMany({
      where: {
        staff_type: 'teaching',
        lms_sync_status: 'pending',
        email: { not: null },
        lms_sync_attempts: { lt: STAFF_LMS_SYNC_MAX_ATTEMPTS },
      },
      orderBy: { staff_id: 'asc' },
      take: limit,
      select: { staff_id: true },
    });
    for (const r of rows) await this.sync(r.staff_id);
    return rows.length;
  }

  /**
   * Pushes a live status change (relieved/reinstated) to a teacher's LMS
   * login. A no-op if the staff member was never synced (no LMS teacher
   * exists to update) — never throws into the relieve/reinstate flow.
   */
  async pushStatus(staffId: number, status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    const cfg = this.config();
    if (!cfg) return;

    const staff = await this.prisma.staffMember.findUnique({ where: { staff_id: staffId } });
    if (!staff || staff.lms_sync_status !== 'synced') return;

    try {
      const res = await fetch(`${cfg.baseUrl}/internal/erp/teachers/status`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-internal-key': cfg.key,
        },
        body: JSON.stringify({
          instituteId: staff.institute_id || cfg.instituteId,
          employeeId: staff.staff_code,
          status,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        const body: any = await res.json().catch(() => ({}));
        throw new Error(`LMS ${res.status}: ${JSON.stringify(body?.message ?? res.statusText)}`);
      }
    } catch (err) {
      this.logger.warn(`Staff LMS status push failed for #${staffId}: ${(err as Error).message}`);
    }
  }

  /**
   * Pushes a department reassignment to a teacher's LMS record. A no-op if
   * the staff member was never synced — never throws into the update flow.
   */
  async pushDepartment(staffId: number, departmentName: string): Promise<void> {
    const cfg = this.config();
    if (!cfg) return;

    const staff = await this.prisma.staffMember.findUnique({ where: { staff_id: staffId } });
    if (!staff || staff.lms_sync_status !== 'synced') return;

    try {
      const res = await fetch(`${cfg.baseUrl}/internal/erp/teachers/department`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-internal-key': cfg.key,
        },
        body: JSON.stringify({
          instituteId: staff.institute_id || cfg.instituteId,
          employeeId: staff.staff_code,
          department: departmentName,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        const body: any = await res.json().catch(() => ({}));
        throw new Error(`LMS ${res.status}: ${JSON.stringify(body?.message ?? res.statusText)}`);
      }
    } catch (err) {
      this.logger.warn(`Staff LMS department push failed for #${staffId}: ${(err as Error).message}`);
    }
  }

  /**
   * Read-only: every teacher that already exists in the LMS for this
   * institute, cross-referenced against the ERP's own staff directory
   * (matched by employeeId === staff_code) so an admin can see which LMS
   * teachers have no ERP record yet. Does not write anything.
   */
  async listLmsTeachers(instituteId: string) {
    const cfg = this.config();
    if (!cfg) {
      throw new Error('LMS_BASE_URL / INTERNAL_API_KEY not configured');
    }

    const res = await fetch(`${cfg.baseUrl}/internal/erp/teachers?instituteId=${encodeURIComponent(cfg.instituteId || instituteId)}`, {
      headers: { 'x-internal-key': cfg.key },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = body?.message?.message ?? body?.message ?? res.statusText;
      throw new Error(`LMS ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    }
    const lmsTeachers: Array<{
      teacherId: string;
      employeeId: string | null;
      name: string;
      email: string;
      department: string | null;
      designation: string | null;
      joiningDate: string | null;
      isActive: boolean;
    }> = body.data ?? body;

    const employeeIds = lmsTeachers.map((t) => t.employeeId).filter((id): id is string => !!id);
    const teacherIds = lmsTeachers.map((t) => t.teacherId);
    const erpStaff = await this.prisma.staffMember.findMany({
      where: {
        institute_id: instituteId,
        OR: [{ staff_code: { in: employeeIds } }, { lms_teacher_ref: { in: teacherIds } }],
      },
      select: { staff_id: true, staff_code: true, lms_teacher_ref: true },
    });
    const byTeacherRef = new Map(erpStaff.filter((s) => s.lms_teacher_ref).map((s) => [s.lms_teacher_ref as string, s]));
    const byCode = new Map(erpStaff.map((s) => [s.staff_code, s]));

    // Some LMS institutes have data-quality issues where several different
    // teachers share one employeeId. Matching those by code alone would make
    // every one of them look "already imported" the moment any one of them
    // is — so an exact teacherId match (set once a specific teacher is
    // actually imported) always wins, and a bare code match is only trusted
    // when that employeeId isn't shared by more than one LMS teacher.
    const employeeIdCounts = new Map<string, number>();
    for (const id of employeeIds) employeeIdCounts.set(id, (employeeIdCounts.get(id) ?? 0) + 1);

    return lmsTeachers.map((t) => {
      const duplicate_employee_id = !!t.employeeId && (employeeIdCounts.get(t.employeeId) ?? 0) > 1;

      const exact = byTeacherRef.get(t.teacherId);
      if (exact) {
        return { ...t, in_erp: true, erp_staff_id: exact.staff_id, duplicate_employee_id };
      }
      if (!duplicate_employee_id && t.employeeId && byCode.has(t.employeeId)) {
        return { ...t, in_erp: true, erp_staff_id: byCode.get(t.employeeId)!.staff_id, duplicate_employee_id };
      }
      return { ...t, in_erp: false, erp_staff_id: null, duplicate_employee_id };
    });
  }
}
