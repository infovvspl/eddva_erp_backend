import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Give up automatic retries after this many failed pushes; an admin can still retry manually. */
export const LMS_SYNC_MAX_ATTEMPTS = 10;
const REQUEST_TIMEOUT_MS = 15_000;

export interface LmsSyncOutcome {
  confirmation_id: number;
  status: 'linked' | 'skipped' | 'failed';
  message?: string;
}

/**
 * One-way push of confirmed admissions to the LMS: ERP → LMS, students only.
 * Never throws into the admission flow — a failed push leaves the confirmation
 * `pending` with the error recorded, and the scheduler / admin retry picks it up.
 * The LMS upserts by (institute, enrollment number), so retries are safe.
 */
@Injectable()
export class LmsSyncService {
  private readonly logger = new Logger(LmsSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  private config() {
    const baseUrl = process.env.LMS_BASE_URL?.replace(/\/+$/, '');
    const key = process.env.INTERNAL_API_KEY;
    const instituteId = process.env.LMS_INSTITUTE_ID?.trim();
    let sectionIdsByProgram: Record<string, string> = {};
    try {
      const parsed = JSON.parse(process.env.LMS_SECTION_IDS_BY_PROGRAM ?? '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        sectionIdsByProgram = Object.fromEntries(
          Object.entries(parsed).flatMap(([program, sectionId]) =>
            typeof sectionId === 'string' && sectionId.trim()
              ? [[program, sectionId.trim()] as [string, string]]
              : [],
          ),
        ) as Record<string, string>;
      }
    } catch {
      this.logger.warn('LMS_SECTION_IDS_BY_PROGRAM is not valid JSON; falling back to LMS name matching');
    }
    return baseUrl && key ? { baseUrl, key, instituteId, sectionIdsByProgram } : null;
  }

  /** Fire-and-forget entry point for the confirm flow. */
  trigger(confirmationId: number): void {
    this.sync(confirmationId).catch((err) =>
      this.logger.error(`LMS sync crashed for #${confirmationId}`, err as Error),
    );
  }

  async sync(confirmationId: number): Promise<LmsSyncOutcome> {
    const cfg = this.config();
    if (!cfg) {
      return {
        confirmation_id: confirmationId,
        status: 'skipped',
        message: 'LMS_BASE_URL / INTERNAL_API_KEY not configured',
      };
    }

    const c = await this.prisma.admissionConfirmation.findUnique({
      where: { confirmation_id: confirmationId },
      include: {
        application: {
          include: { applicant: true, program: true },
        },
      },
    });
    if (!c || c.status !== 'confirmed' || c.student_link_status !== 'pending') {
      return {
        confirmation_id: confirmationId,
        status: 'skipped',
        message: 'Not a confirmed admission awaiting LMS sync',
      };
    }

    const { applicant, program } = c.application;
    const payload = {
      // The ERP tenant ID and LMS institute ID are separate identifiers.
      instituteId: cfg.instituteId || c.application.institute_id,
      enrollmentNumber: c.enrollment_number,
      name: applicant.name,
      email: applicant.email ?? undefined,
      phone: applicant.phone,
      dob: applicant.dob?.toISOString().slice(0, 10),
      gender: applicant.gender ?? undefined,
      fatherName: applicant.guardian_name ?? undefined,
      parentPhone: applicant.guardian_contact ?? undefined,
      address: applicant.address ?? undefined,
      admissionDate: c.confirmed_date.toISOString().slice(0, 10),
      className: program.name,
      sectionId: cfg.sectionIdsByProgram[program.name] || undefined,
    };

    try {
      const res = await fetch(`${cfg.baseUrl}/internal/erp/students`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-key': cfg.key,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = body?.message?.message ?? body?.message ?? res.statusText;
        throw new Error(`LMS ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
      }
      // The LMS global response interceptor wraps controller output in `data`.
      // Accept either shape so this remains compatible with an unwrapped internal API.
      const studentRef = String(body.studentId ?? body.data?.studentId ?? '');
      if (!studentRef) throw new Error('LMS response had no studentId');

      // Guarded like linkStudent(): only a still-pending confirmation is linked.
      await this.prisma.admissionConfirmation.updateMany({
        where: { confirmation_id: confirmationId, student_link_status: 'pending' },
        data: {
          student_ref: studentRef,
          student_link_status: 'linked',
          lms_sync_error: null,
          lms_last_attempt_at: new Date(),
          lms_sync_attempts: { increment: 1 },
        },
      });
      return { confirmation_id: confirmationId, status: 'linked' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`LMS sync failed for #${confirmationId}: ${message}`);
      await this.prisma.admissionConfirmation.update({
        where: { confirmation_id: confirmationId },
        data: {
          lms_sync_error: message.slice(0, 500),
          lms_last_attempt_at: new Date(),
          lms_sync_attempts: { increment: 1 },
        },
      });
      return { confirmation_id: confirmationId, status: 'failed', message };
    }
  }

  /** Re-pushes confirmations still waiting for their LMS student. */
  async retryPending(limit = 50): Promise<number> {
    if (!this.config()) return 0;
    const rows = await this.prisma.admissionConfirmation.findMany({
      where: {
        status: 'confirmed',
        student_link_status: 'pending',
        lms_sync_attempts: { lt: LMS_SYNC_MAX_ATTEMPTS },
      },
      orderBy: { confirmation_id: 'asc' },
      take: limit,
      select: { confirmation_id: true },
    });
    for (const r of rows) await this.sync(r.confirmation_id);
    return rows.length;
  }
}
