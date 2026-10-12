import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, CreateAuditLogParams } from '../../audit/audit.service';
import { StaffPlatformUser } from '../auth/staff-auth.service';

/**
 * Thin wrapper around the shared core AuditService — reused rather than
 * building a separate audit implementation. `AuditLog.userId` is a real FK to
 * core `users.id`, but staff-module users are identified by `eddva_user_id` and
 * may not exist as core `users` rows. To keep Staff independent of the core
 * users table the FK column is never set: the acting user is recorded in
 * `metadata.actor` (id + name). Scheduled sweeps pass no actor and are
 * recorded as `{ system: true }`.
 */
@Injectable()
export class StaffAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async log(
    actor: StaffPlatformUser | undefined,
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

  /** Newest-first audit trail for one entity. */
  trail(entityType: string, entityId: number, limit = 200) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId: String(entityId) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
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
