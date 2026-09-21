import { Injectable } from '@nestjs/common';
import {
  AlumniCommChannel,
  AlumniCommStatus,
  AlumniNewsletter,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { AlumniAuditService } from '../common/alumni-audit.service';
import { ALUMNI_ENTITY } from '../common/alumni-entities';
import { AlumniLookupService } from '../common/alumni-lookup.service';
import { BusinessException } from '../common/business-exception';
import { buildMeta, parsePagination } from '../common/pagination.util';
import { AlumniNotificationService } from '../notifications/alumni-notification.service';
import {
  CreateNewsletterDto,
  PreviewRecipientsQueryDto,
  QueryNewsletterDto,
  SendNewsletterDto,
  UpdateNewsletterDto,
} from './dto/newsletter.dto';
import {
  NormalizedSegment,
  buildSegmentWhere,
  normalizeSegment,
} from './segment';

const BATCH_SIZE = 1000;
const SEND_TX = { timeout: 120_000, maxWait: 10_000 } as const;

function segmentOf(newsletter: AlumniNewsletter): NormalizedSegment {
  return newsletter.target_segment as unknown as NormalizedSegment;
}

@Injectable()
export class NewslettersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AlumniLookupService,
    private readonly audit: AlumniAuditService,
    private readonly notifications: AlumniNotificationService,
  ) {}

  async create(actor: AlumniPlatformUser, dto: CreateNewsletterDto) {
    const segment = normalizeSegment(dto.target_segment);
    const newsletter = await this.prisma.alumniNewsletter.create({
      data: {
        institute_id: actor.institute_id,
        title: dto.title,
        content: dto.content,
        target_segment: segment as unknown as Prisma.InputJsonValue,
        created_by: actor.eddva_user_id,
      },
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.NEWSLETTER,
      entityId: String(newsletter.newsletter_id),
      action: 'create',
      newStatus: 'draft',
      metadata: { segment },
    });
    return newsletter;
  }

  async findAll(actor: AlumniPlatformUser, query: QueryNewsletterDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.AlumniNewsletterWhereInput = {
      institute_id: actor.institute_id,
      status: query.status,
      ...(query.search
        ? { title: { contains: query.search.trim(), mode: 'insensitive' } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alumniNewsletter.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { newsletter_id: 'desc' }],
        skip,
        take,
        // The body can be large; the list only needs the header.
        omit: { content: true },
      }),
      this.prisma.alumniNewsletter.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  findOne(actor: AlumniPlatformUser, id: number) {
    return this.lookup.newsletter(actor.institute_id, id);
  }

  /** Only a draft can change: a sent newsletter is a record of what was sent. */
  async update(
    actor: AlumniPlatformUser,
    id: number,
    dto: UpdateNewsletterDto,
  ) {
    const existing = await this.lookup.newsletter(actor.institute_id, id);
    this.assertDraft(existing);
    const segment = dto.target_segment
      ? normalizeSegment(dto.target_segment)
      : undefined;
    const { count } = await this.prisma.alumniNewsletter.updateMany({
      where: { newsletter_id: id, status: 'draft' },
      data: {
        title: dto.title,
        content: dto.content,
        target_segment: segment as unknown as Prisma.InputJsonValue | undefined,
      },
    });
    if (count === 0) this.throwAlreadySent();
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.NEWSLETTER,
      entityId: String(id),
      action: 'update',
      metadata: { fields: Object.keys(dto) },
    });
    return this.lookup.newsletter(actor.institute_id, id);
  }

  async remove(actor: AlumniPlatformUser, id: number) {
    const existing = await this.lookup.newsletter(actor.institute_id, id);
    this.assertDraft(existing);
    const { count } = await this.prisma.alumniNewsletter.deleteMany({
      where: { newsletter_id: id, status: 'draft' },
    });
    if (count === 0) this.throwAlreadySent();
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.NEWSLETTER,
      entityId: String(id),
      action: 'delete',
    });
    return { newsletter_id: id, deleted: true };
  }

  private assertDraft(newsletter: AlumniNewsletter) {
    if (newsletter.status !== 'draft') this.throwAlreadySent();
  }

  private throwAlreadySent(): never {
    throw new BusinessException(
      'NEWSLETTER_ALREADY_SENT',
      'This newsletter has already been sent and can no longer be changed, deleted or re-sent',
      undefined,
      409,
    );
  }

  // ─── Recipients ──────────────────────────────────────────────────────────

  /** Live recipient count for one channel — evaluated against current data. */
  private countRecipients(
    instituteId: string,
    segment: NormalizedSegment,
    channel: AlumniCommChannel,
  ) {
    return this.prisma.alumniProfile.count({
      where: buildSegmentWhere(instituteId, segment, channel),
    });
  }

  private async previewSegment(
    actor: AlumniPlatformUser,
    segment: NormalizedSegment,
    query: PreviewRecipientsQueryDto,
  ) {
    const channel = query.channel ?? 'email';
    const { skip, take, page, limit } = parsePagination(query);
    const where = buildSegmentWhere(actor.institute_id, segment, channel);
    const [rows, total, email, sms] = await Promise.all([
      this.prisma.alumniProfile.findMany({
        where,
        orderBy: { alumni_id: 'asc' },
        skip,
        take,
        select: {
          alumni_id: true,
          full_name: true,
          email: true,
          phone: true,
          batch_year: true,
          program: true,
          city: true,
        },
      }),
      this.prisma.alumniProfile.count({ where }),
      this.countRecipients(actor.institute_id, segment, 'email'),
      this.countRecipients(actor.institute_id, segment, 'sms'),
    ]);
    return {
      segment,
      channel,
      recipient_counts: { email, sms },
      data: rows,
      pagination: buildMeta(total, page, limit),
    };
  }

  async previewRecipients(
    actor: AlumniPlatformUser,
    id: number,
    query: PreviewRecipientsQueryDto,
  ) {
    const newsletter = await this.lookup.newsletter(actor.institute_id, id);
    return this.previewSegment(actor, segmentOf(newsletter), query);
  }

  /** Preview an audience while authoring, before the newsletter is saved. */
  previewAdHoc(
    actor: AlumniPlatformUser,
    dto: CreateNewsletterDto['target_segment'],
    query: PreviewRecipientsQueryDto,
  ) {
    return this.previewSegment(actor, normalizeSegment(dto), query);
  }

  // ─── Send ────────────────────────────────────────────────────────────────

  /**
   * "Sending" = resolving the audience NOW and writing one `queued`
   * communication log per recipient and channel, all in one transaction with the
   * draft → sent flip. The synchronous work is only inserts (batched), never
   * e-mail/SMS calls, so it stays fast for large audiences; actual delivery is
   * the job of a mail/SMS worker that drains the `queued` logs and reports back
   * through `PATCH communication-logs/:id` (no provider exists in this backend
   * today, so logs stay `queued` — nothing is faked as sent).
   *
   * Duplicate sends are impossible three ways: the draft → sent compare-and-set,
   * the row lock, and the unique (newsletter, alumnus, channel) log index.
   */
  async send(actor: AlumniPlatformUser, id: number, dto: SendNewsletterDto) {
    const newsletter = await this.lookup.newsletter(actor.institute_id, id);
    this.assertDraft(newsletter);
    const segment = normalizeSegment(segmentOf(newsletter)); // re-validate what is stored
    const channels = [
      ...new Set(dto.channels?.length ? dto.channels : ['email' as const]),
    ];

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lookup.lock(tx, 'newsletter', actor.institute_id, id);
      const { count } = await tx.alumniNewsletter.updateMany({
        where: { newsletter_id: id, status: 'draft' },
        data: {
          status: 'sent',
          sent_at: new Date(),
          sent_by: actor.eddva_user_id,
        },
      });
      if (count === 0) this.throwAlreadySent();

      const byChannel: Record<string, number> = {};
      let total = 0;
      for (const channel of channels) {
        const where = buildSegmentWhere(actor.institute_id, segment, channel);
        let cursor = 0;
        let queued = 0;
        for (;;) {
          const batch = await tx.alumniProfile.findMany({
            where: { ...where, alumni_id: { gt: cursor } },
            orderBy: { alumni_id: 'asc' },
            take: BATCH_SIZE,
            select: { alumni_id: true, email: true, phone: true },
          });
          if (batch.length === 0) break;
          const { count: created } = await tx.alumniCommunicationLog.createMany(
            {
              data: batch.map((a) => ({
                institute_id: actor.institute_id,
                newsletter_id: id,
                alumni_id: a.alumni_id,
                channel,
                recipient: channel === 'email' ? a.email : (a.phone as string),
                status: 'queued' as const,
              })),
              skipDuplicates: true,
            },
          );
          queued += created;
          cursor = batch[batch.length - 1].alumni_id;
        }
        byChannel[channel] = queued;
        total += queued;
      }
      if (total === 0) {
        // Rolls the draft → sent flip back: an empty audience is an authoring mistake, not a send.
        throw new BusinessException(
          'NO_RECIPIENTS',
          'The audience has no eligible recipients (verified, active, opted in)',
          { segment },
        );
      }
      await tx.alumniNewsletter.update({
        where: { newsletter_id: id },
        data: { recipient_count: total },
      });
      return { total, byChannel };
    }, SEND_TX);

    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.NEWSLETTER,
      entityId: String(id),
      action: 'send',
      oldStatus: 'draft',
      newStatus: 'sent',
      metadata: { segment, channels, queued: result.byChannel },
    });
    await this.notifications.notifyStaff({
      instituteId: actor.institute_id,
      entityType: ALUMNI_ENTITY.NEWSLETTER,
      entityId: id,
      eventType: 'newsletter_sent',
      message: `Newsletter "${newsletter.title}" was queued for ${result.total} message(s).`,
    });
    return {
      newsletter_id: id,
      status: 'sent',
      recipient_count: result.total,
      queued_by_channel: result.byChannel,
    };
  }

  // ─── Statistics ──────────────────────────────────────────────────────────

  async stats(actor: AlumniPlatformUser, id: number) {
    const newsletter = await this.lookup.newsletter(actor.institute_id, id);
    const rows = await this.prisma.alumniCommunicationLog.groupBy({
      by: ['channel', 'status'],
      where: { newsletter_id: id, institute_id: actor.institute_id },
      _count: { _all: true },
    });
    return {
      newsletter_id: id,
      title: newsletter.title,
      status: newsletter.status,
      sent_at: newsletter.sent_at,
      ...summariseLogs(rows),
    };
  }
}

export type LogGroup = {
  channel: AlumniCommChannel;
  status: AlumniCommStatus;
  _count: { _all: number };
};

/**
 * Rolls per-status counts into delivery / open / click figures. `opened` counts
 * everyone who opened or clicked, `delivered` everyone past `queued` that did not
 * fail. Rates are null until there is something to divide by, and open/click
 * figures are only as real as the provider callbacks that set them.
 */
export function summariseLogs(rows: LogGroup[]) {
  const totals: Record<AlumniCommStatus, number> = {
    queued: 0,
    sent: 0,
    opened: 0,
    clicked: 0,
    failed: 0,
  };
  const byChannel: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    totals[r.status] += r._count._all;
    byChannel[r.channel] ??= {};
    byChannel[r.channel][r.status] = r._count._all;
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  const delivered = totals.sent + totals.opened + totals.clicked;
  const opened = totals.opened + totals.clicked;
  const rate = (n: number, d: number) =>
    d === 0 ? null : Number((n / d).toFixed(4));
  return {
    total_messages: total,
    by_status: totals,
    by_channel: byChannel,
    delivered,
    opened,
    clicked: totals.clicked,
    failed: totals.failed,
    delivery_rate: rate(delivered, total - totals.queued),
    open_rate: rate(opened, delivered),
    click_rate: rate(totals.clicked, delivered),
  };
}
