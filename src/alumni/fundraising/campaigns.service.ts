import { Injectable } from '@nestjs/common';
import { AlumniCampaign, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { AlumniAuditService } from '../common/alumni-audit.service';
import { ALUMNI_ENTITY } from '../common/alumni-entities';
import { AlumniLookupService } from '../common/alumni-lookup.service';
import { BusinessException } from '../common/business-exception';
import { buildMeta, parsePagination } from '../common/pagination.util';
import { sqlNowUtc } from '../common/sql-time';
import { localToday, parseDateOnly } from '../common/time.util';
import {
  CreateCampaignDto,
  QueryCampaignDto,
  UpdateCampaignDto,
} from './dto/fundraising.dto';

/**
 * Re-derives a campaign's cached `raised_amount` from the donation LEDGER
 * (SUM of `received` donations) inside the caller's transaction. It recomputes
 * instead of incrementing, so the cache can never drift from the ledger, and a
 * reversal or a repair is the same operation as a receipt. The campaign row
 * must already be locked by the caller.
 */
export async function recomputeCampaignTotal(
  tx: Prisma.TransactionClient,
  campaignId: number,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "alumni_campaigns"
    SET "raised_amount" = COALESCE(
          (SELECT SUM("amount") FROM "alumni_donations"
           WHERE "campaign_id" = ${campaignId} AND "status" = 'received'), 0),
        "updated_at" = ${sqlNowUtc}
    WHERE "campaign_id" = ${campaignId}`;
}

function asNumber(value: Prisma.Decimal | null | undefined): number {
  return value == null ? 0 : Number(value);
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AlumniLookupService,
    private readonly audit: AlumniAuditService,
  ) {}

  private present(c: AlumniCampaign) {
    const goal = Number(c.goal_amount);
    const raised = Number(c.raised_amount);
    return {
      ...c,
      progress_pct: goal > 0 ? Number(((raised / goal) * 100).toFixed(2)) : 0,
    };
  }

  private assertDates(start: Date, end: Date) {
    if (end.getTime() < start.getTime()) {
      throw new BusinessException(
        'INVALID_CAMPAIGN_DATES',
        'end_date cannot be before start_date',
      );
    }
  }

  async create(actor: AlumniPlatformUser, dto: CreateCampaignDto) {
    const start = parseDateOnly(dto.start_date, 'start_date');
    const end = parseDateOnly(dto.end_date, 'end_date');
    this.assertDates(start, end);
    if (end.getTime() < localToday().getTime()) {
      throw new BusinessException(
        'INVALID_CAMPAIGN_DATES',
        'end_date cannot be in the past',
      );
    }
    const campaign = await this.prisma.alumniCampaign.create({
      data: {
        institute_id: actor.institute_id,
        title: dto.title,
        description: dto.description,
        goal_amount: new Prisma.Decimal(dto.goal_amount),
        start_date: start,
        end_date: end,
        created_by: actor.eddva_user_id,
      },
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.CAMPAIGN,
      entityId: String(campaign.campaign_id),
      action: 'create',
      newStatus: campaign.status,
      metadata: { goal_amount: campaign.goal_amount.toFixed(2) },
    });
    return this.present(campaign);
  }

  async findAll(actor: AlumniPlatformUser, query: QueryCampaignDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.AlumniCampaignWhereInput = {
      institute_id: actor.institute_id,
      status: query.status,
      ...(query.search
        ? { title: { contains: query.search.trim(), mode: 'insensitive' } }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.alumniCampaign.findMany({
        where,
        orderBy: [{ start_date: 'desc' }, { campaign_id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.alumniCampaign.count({ where }),
    ]);
    return {
      data: rows.map((c) => this.present(c)),
      pagination: buildMeta(total, page, limit),
    };
  }

  async findOne(actor: AlumniPlatformUser, id: number) {
    return this.present(await this.lookup.campaign(actor.institute_id, id));
  }

  async update(actor: AlumniPlatformUser, id: number, dto: UpdateCampaignDto) {
    const existing = await this.lookup.campaign(actor.institute_id, id);
    if (existing.status === 'closed') {
      throw new BusinessException(
        'CAMPAIGN_CLOSED',
        'A closed campaign cannot be edited',
      );
    }
    const end = dto.end_date
      ? parseDateOnly(dto.end_date, 'end_date')
      : existing.end_date;
    this.assertDates(existing.start_date, end);
    // Extending a campaign that had ended brings it back to life.
    const reactivate =
      existing.status === 'completed' &&
      end.getTime() >= localToday().getTime();
    const updated = await this.prisma.alumniCampaign.update({
      where: { campaign_id: id },
      data: {
        title: dto.title,
        description: dto.description,
        goal_amount:
          dto.goal_amount === undefined
            ? undefined
            : new Prisma.Decimal(dto.goal_amount),
        end_date: end,
        ...(reactivate ? { status: 'active' as const } : {}),
      },
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.CAMPAIGN,
      entityId: String(id),
      action: 'update',
      oldStatus: existing.status,
      newStatus: updated.status,
      metadata: { fields: Object.keys(dto) },
    });
    return this.present(updated);
  }

  /** Stops the campaign taking money. Already-received donations are untouched; pending pledges must be resolved. */
  async close(actor: AlumniPlatformUser, id: number) {
    await this.lookup.campaign(actor.institute_id, id);
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lookup.lock(tx, 'campaign', actor.institute_id, id);
      const { count } = await tx.alumniCampaign.updateMany({
        where: { campaign_id: id, status: { not: 'closed' } },
        data: { status: 'closed', closed_at: new Date() },
      });
      if (count === 0) {
        throw new BusinessException(
          'CAMPAIGN_CLOSED',
          'This campaign is already closed',
          undefined,
          409,
        );
      }
      const pending = await tx.alumniDonation.count({
        where: { campaign_id: id, status: 'pending' },
      });
      return { pending };
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.CAMPAIGN,
      entityId: String(id),
      action: 'close',
      newStatus: 'closed',
      metadata: { pending_donations: result.pending },
    });
    return {
      ...this.present(await this.lookup.campaign(actor.institute_id, id)),
      pending_donations_to_resolve: result.pending,
    };
  }

  /**
   * Campaign statistics computed from the donation LEDGER, not from the cached
   * `raised_amount` (which is reported alongside so drift is visible).
   */
  async statistics(actor: AlumniPlatformUser, id: number) {
    const campaign = await this.lookup.campaign(actor.institute_id, id);
    const [received, pending, donors, byMode, byMonth, anonymous, largest] =
      await Promise.all([
        this.prisma.alumniDonation.aggregate({
          where: { campaign_id: id, status: 'received' },
          _sum: { amount: true },
          _count: { _all: true },
          _avg: { amount: true },
        }),
        this.prisma.alumniDonation.aggregate({
          where: { campaign_id: id, status: 'pending' },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.alumniDonation.groupBy({
          by: ['alumni_id'],
          where: { campaign_id: id, status: 'received' },
        }),
        this.prisma.alumniDonation.groupBy({
          by: ['payment_mode'],
          where: { campaign_id: id, status: 'received' },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.$queryRaw<
          Array<{ month: Date; total: Prisma.Decimal; count: bigint }>
        >`
          SELECT date_trunc('month', "received_at") AS month,
                 SUM("amount") AS total, COUNT(*) AS count
          FROM "alumni_donations"
          WHERE "campaign_id" = ${id} AND "status" = 'received'
          GROUP BY 1 ORDER BY 1`,
        this.prisma.alumniDonation.count({
          where: { campaign_id: id, status: 'received', is_anonymous: true },
        }),
        this.prisma.alumniDonation.aggregate({
          where: { campaign_id: id, status: 'received' },
          _max: { amount: true },
        }),
      ]);
    const ledgerTotal = asNumber(received._sum.amount);
    const goal = Number(campaign.goal_amount);
    return {
      campaign_id: id,
      title: campaign.title,
      status: campaign.status,
      goal_amount: goal,
      raised_amount: ledgerTotal,
      cached_raised_amount: Number(campaign.raised_amount),
      cache_matches_ledger: ledgerTotal === Number(campaign.raised_amount),
      progress_pct:
        goal > 0 ? Number(((ledgerTotal / goal) * 100).toFixed(2)) : 0,
      remaining: Math.max(0, goal - ledgerTotal),
      donations: {
        received_count: received._count._all,
        average: asNumber(received._avg.amount),
        largest: asNumber(largest._max.amount),
        anonymous_count: anonymous,
        pending_count: pending._count._all,
        pending_amount: asNumber(pending._sum.amount),
      },
      donor_count: donors.length,
      by_payment_mode: byMode.map((m) => ({
        payment_mode: m.payment_mode,
        count: m._count._all,
        total: asNumber(m._sum.amount),
      })),
      by_month: byMonth.map((m) => ({
        month: m.month,
        total: Number(m.total),
        count: Number(m.count),
      })),
    };
  }

  /** Scheduled: an active campaign whose end date has passed becomes `completed`. */
  async completeEndedCampaigns(): Promise<number> {
    const { count } = await this.prisma.alumniCampaign.updateMany({
      where: { status: 'active', end_date: { lt: localToday() } },
      data: { status: 'completed' },
    });
    return count;
  }
}
