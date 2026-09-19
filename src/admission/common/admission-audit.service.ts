import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, CreateAuditLogParams } from '../../audit/audit.service';
import { AdmissionPlatformUser } from '../auth/admission-auth.service';

/**
 * Thin wrapper around the shared core AuditService — reused rather than
 * building a separate audit implementation. `AuditLog.userId` is a real FK to
 * core `users.id`, but Admission staff are identified by `eddva_user_id` and
 * may not exist as core `users` rows at all. To keep Admission independent of
 * the core users table, the FK column is never set: the acting staff member is
 * always recorded in `metadata.actor` (id + name), which is what the activity
 * timeline reads back.
 *
 * `metadata.application_id` should be set by callers for any application-scoped
 * event so it shows up in that application's activity timeline.
 */
@Injectable()
export class AdmissionAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async log(
    actor: AdmissionPlatformUser | undefined,
    params: Omit<CreateAuditLogParams, 'userId'>,
  ) {
    return this.audit.log({
      ...params,
      metadata: {
        ...((params.metadata as Record<string, unknown> | undefined) ?? {}),
        actor: actor
          ? { eddva_user_id: actor.eddva_user_id, user_name: actor.user_name }
          : { system: true },
      },
    });
  }

  /** Newest-first audit trail for one application: its own events plus those of its child records. */
  async getApplicationActivity(applicationId: number, limit = 200) {
    return this.prisma.auditLog.findMany({
      where: {
        OR: [
          {
            entityType: 'admission_application',
            entityId: String(applicationId),
          },
          { metadata: { path: ['application_id'], equals: applicationId } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        action: true,
        oldStatus: true,
        newStatus: true,
        reason: true,
        metadata: true,
        createdAt: true,
      },
    });
  }
}
