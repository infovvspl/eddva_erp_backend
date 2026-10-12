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
          instituteId: cfg.instituteId || staff.institute_id,
          employeeId: staff.staff_code,
          name: staff.full_name,
          email: staff.email,
          phone: staff.phone ?? undefined,
          department: staff.department.name,
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

      // Guarded like the admission/alumni sync: only a still-pending member is flipped.
      await this.prisma.staffMember.updateMany({
        where: { staff_id: staffId, lms_sync_status: 'pending' },
        data: {
          lms_teacher_ref: teacherRef,
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
          instituteId: cfg.instituteId || staff.institute_id,
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
}
