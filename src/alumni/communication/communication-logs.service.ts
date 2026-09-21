import { Injectable, NotFoundException } from '@nestjs/common';
import { AlumniCommStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { AlumniAuditService } from '../common/alumni-audit.service';
import { ALUMNI_ENTITY } from '../common/alumni-entities';
import { assertTransition } from '../common/alumni-state';
import { buildMeta, parsePagination } from '../common/pagination.util';
import {
  QueryCommunicationLogDto,
  UpdateCommunicationLogDto,
} from './dto/newsletter.dto';

/**
 * Delivery feedback only moves forward. `opened`/`clicked` are accepted only
 * from a delivery provider (or its worker) calling the update endpoint — this
 * backend never infers or fabricates them.
 */
export const COMM_TRANSITIONS: Record<
  AlumniCommStatus,
  readonly AlumniCommStatus[]
> = {
  queued: ['sent', 'failed'],
  sent: ['opened', 'clicked', 'failed'],
  opened: ['clicked'],
  clicked: [],
  failed: [],
};

@Injectable()
export class CommunicationLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AlumniAuditService,
  ) {}

  async findAll(actor: AlumniPlatformUser, query: QueryCommunicationLogDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.AlumniCommunicationLogWhereInput = {
      institute_id: actor.institute_id,
      newsletter_id: query.newsletter_id,
      alumni_id: query.alumni_id,
      channel: query.channel,
      status: query.status,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alumniCommunicationLog.findMany({
        where,
        orderBy: { log_id: 'desc' },
        skip,
        take,
        include: {
          alumni: { select: { alumni_id: true, full_name: true } },
          newsletter: { select: { newsletter_id: true, title: true } },
        },
      }),
      this.prisma.alumniCommunicationLog.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async updateStatus(
    actor: AlumniPlatformUser,
    id: number,
    dto: UpdateCommunicationLogDto,
  ) {
    const log = await this.prisma.alumniCommunicationLog.findFirst({
      where: { log_id: id, institute_id: actor.institute_id },
    });
    if (!log) throw new NotFoundException(`Communication log #${id} not found`);
    assertTransition(COMM_TRANSITIONS, log.status, dto.status, 'The message');

    const now = new Date();
    const { count } = await this.prisma.alumniCommunicationLog.updateMany({
      where: { log_id: id, status: log.status },
      data: {
        status: dto.status,
        ...(dto.status === 'sent' ? { sent_at: now } : {}),
        ...(dto.status === 'opened' || dto.status === 'clicked'
          ? { opened_at: log.opened_at ?? now }
          : {}),
        ...(dto.status === 'clicked' ? { clicked_at: now } : {}),
        ...(dto.status === 'failed'
          ? { failure_reason: dto.failure_reason ?? 'delivery failed' }
          : {}),
      },
    });
    if (count === 0) {
      // Another callback moved it first; report the current state instead of failing the provider.
      return this.prisma.alumniCommunicationLog.findUniqueOrThrow({
        where: { log_id: id },
      });
    }
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.NEWSLETTER,
      entityId: String(log.newsletter_id),
      action: 'delivery_update',
      oldStatus: log.status,
      newStatus: dto.status,
      metadata: { log_id: id, alumni_id: log.alumni_id, channel: log.channel },
    });
    return this.prisma.alumniCommunicationLog.findUniqueOrThrow({
      where: { log_id: id },
    });
  }
}
