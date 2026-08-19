import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAuditLogParams {
  userId?: string;
  entityType: string;
  entityId: string;
  action: string;
  oldStatus?: string;
  newStatus?: string;
  reason?: string;
  metadata?: any;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: CreateAuditLogParams) {
    return this.prisma.auditLog.create({
      data: {
        userId: params.userId,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        oldStatus: params.oldStatus,
        newStatus: params.newStatus,
        reason: params.reason,
        metadata: params.metadata ?? undefined,
      },
    });
  }

  async getLogsForEntity(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }
}
