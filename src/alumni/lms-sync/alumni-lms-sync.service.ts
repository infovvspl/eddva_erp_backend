import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Give up automatic retries after this many failed pushes; an admin can still retry manually. */
export const ALUMNI_LMS_SYNC_MAX_ATTEMPTS = 10;
const REQUEST_TIMEOUT_MS = 15_000;

export interface AlumniLmsSyncOutcome {
  alumni_id: number;
  status: 'synced' | 'skipped' | 'failed';
  message?: string;
}

/**
 * One-way push: when an alumni profile is created with a `student_ref`,
 * marks the matching LMS student GRADUATED (deactivating their LMS login).
 * Mirrors admission's lms-sync — never throws into the registration flow,
 * a failed push leaves the profile `pending` with the error recorded, and
 * the scheduler / admin retry picks it up. Reuses the same LMS_BASE_URL /
 * INTERNAL_API_KEY as admission; the LMS exposes one internal API for both.
 */
@Injectable()
export class AlumniLmsSyncService {
  private readonly logger = new Logger(AlumniLmsSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  private config() {
    const baseUrl = process.env.LMS_BASE_URL?.replace(/\/+$/, '');
    const key = process.env.INTERNAL_API_KEY;
    const instituteId = process.env.LMS_INSTITUTE_ID?.trim();
    return baseUrl && key ? { baseUrl, key, instituteId } : null;
  }

  /** Fire-and-forget entry point for the registration flow. */
  trigger(alumniId: number): void {
    this.sync(alumniId).catch((err) =>
      this.logger.error(`Alumni LMS sync crashed for #${alumniId}`, err as Error),
    );
  }

  async sync(alumniId: number): Promise<AlumniLmsSyncOutcome> {
    const cfg = this.config();
    if (!cfg) {
      return {
        alumni_id: alumniId,
        status: 'skipped',
        message: 'LMS_BASE_URL / INTERNAL_API_KEY not configured',
      };
    }

    const profile = await this.prisma.alumniProfile.findUnique({
      where: { alumni_id: alumniId },
    });
    if (!profile || !profile.student_ref || profile.lms_sync_status !== 'pending') {
      return {
        alumni_id: alumniId,
        status: 'skipped',
        message: 'No student_ref to sync, or already synced',
      };
    }

    try {
      const res = await fetch(`${cfg.baseUrl}/internal/erp/students/status`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-internal-key': cfg.key,
        },
        body: JSON.stringify({
          instituteId: cfg.instituteId || profile.institute_id,
          enrollmentNumber: profile.student_ref,
          status: 'GRADUATED',
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = body?.message?.message ?? body?.message ?? res.statusText;
        throw new Error(`LMS ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
      }

      // Guarded like the admission sync: only a still-pending profile is flipped.
      await this.prisma.alumniProfile.updateMany({
        where: { alumni_id: alumniId, lms_sync_status: 'pending' },
        data: {
          lms_sync_status: 'synced',
          lms_sync_error: null,
          lms_last_attempt_at: new Date(),
          lms_sync_attempts: { increment: 1 },
        },
      });
      return { alumni_id: alumniId, status: 'synced' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Alumni LMS sync failed for #${alumniId}: ${message}`);
      await this.prisma.alumniProfile.update({
        where: { alumni_id: alumniId },
        data: {
          lms_sync_error: message.slice(0, 500),
          lms_last_attempt_at: new Date(),
          lms_sync_attempts: { increment: 1 },
        },
      });
      return { alumni_id: alumniId, status: 'failed', message };
    }
  }

  /** Re-pushes alumni profiles still waiting to be marked GRADUATED in the LMS. */
  async retryPending(limit = 50): Promise<number> {
    if (!this.config()) return 0;
    const rows = await this.prisma.alumniProfile.findMany({
      where: {
        lms_sync_status: 'pending',
        student_ref: { not: null },
        lms_sync_attempts: { lt: ALUMNI_LMS_SYNC_MAX_ATTEMPTS },
      },
      orderBy: { alumni_id: 'asc' },
      take: limit,
      select: { alumni_id: true },
    });
    for (const r of rows) await this.sync(r.alumni_id);
    return rows.length;
  }
}
