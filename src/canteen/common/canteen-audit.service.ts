import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, CreateAuditLogParams } from '../../audit/audit.service';

/**
 * Thin wrapper around the shared core AuditService — reused rather than
 * building a separate audit implementation. `AuditLog.userId` is a real FK to
 * core `users.id`, but a Canteen actor authenticated via the dynamic-role
 * system (direct username/password login) is identified by `eddva_user_id`,
 * which may not exist as a core `users` row at all. This wrapper checks
 * whether the id resolves to a real core user first; if not, identity is
 * preserved in `metadata` instead of the FK column, so audit logging never
 * crashes for non-core-user Canteen staff. Mirrors SalesPurchaseAuditService.
 */
@Injectable()
export class CanteenAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async log(params: CreateAuditLogParams) {
    let safeUserId: string | undefined;

    if (params.userId) {
      const coreUser = await this.prisma.user.findUnique({
        where: { id: params.userId },
        select: { id: true },
      });
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
