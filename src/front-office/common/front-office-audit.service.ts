import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, CreateAuditLogParams } from '../../audit/audit.service';

/**
 * Thin wrapper around the shared core AuditService (the one global audit
 * mechanism, reused as required rather than building a fifth one) — with one
 * adjustment: `AuditLog.userId` is a real FK to core `users.id`, but a Front
 * Office actor authenticated via the dynamic-role system (direct
 * username/password login) is identified by `eddva_user_id`, which may not
 * exist as a core `users` row at all. Passing it straight through would
 * throw a foreign key violation on every audited action performed by a
 * non-core-user Front Office staff member.
 *
 * This wrapper checks whether the id resolves to a real core user first; if
 * not, the identity is preserved in `metadata` instead of the FK column so
 * the audit trail is never silently dropped or crashed.
 */
@Injectable()
export class FrontOfficeAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async log(params: CreateAuditLogParams) {
    let safeUserId: string | undefined;

    if (params.userId) {
      const coreUser = await this.prisma.user.findUnique({ where: { id: params.userId }, select: { id: true } });
      safeUserId = coreUser ? params.userId : undefined;
    }

    return this.audit.log({
      ...params,
      userId: safeUserId,
      metadata: safeUserId
        ? params.metadata
        : { ...(params.metadata ?? {}), acting_eddva_user_id: params.userId },
    });
  }

  async getLogsForEntity(entityType: string, entityId: string) {
    return this.audit.getLogsForEntity(entityType, entityId);
  }
}
