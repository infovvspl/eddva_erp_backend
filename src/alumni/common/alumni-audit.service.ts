import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, CreateAuditLogParams } from '../../audit/audit.service';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';

/**
 * Thin wrapper around the shared core AuditService — reused rather than
 * building a separate audit implementation. `AuditLog.userId` is a real FK to
 * core `users.id`, but alumni staff are identified by `eddva_user_id` and may
 * not exist as core `users` rows. To keep Alumni independent of the core users
 * table the FK column is never set: the acting staff member is recorded in
 * `metadata.actor` (id + name). Scheduled sweeps pass no actor and are
 * recorded as `{ system: true }`.
 */
@Injectable()
export class AlumniAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async log(
    actor: AlumniPlatformUser | undefined,
    params: Omit<CreateAuditLogParams, 'userId'>,
  ) {
    return this.audit.log({
      ...params,
      metadata: {
        ...((params.metadata as Record<string, unknown> | undefined) ?? {}),
        actor: actor
          ? {
              eddva_user_id: actor.eddva_user_id,
              user_name: actor.user_name,
              ...(actor.alumni_id ? { alumni_id: actor.alumni_id } : {}),
            }
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
