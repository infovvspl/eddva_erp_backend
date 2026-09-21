import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlumniDonation, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';
import {
  AlumniAccessService,
  isAlumniPrincipal,
} from '../common/alumni-access.service';
import { AlumniAuditService } from '../common/alumni-audit.service';
import { ALUMNI_ENTITY } from '../common/alumni-entities';
import { AlumniLookupService } from '../common/alumni-lookup.service';
import { AlumniNumberingService } from '../common/alumni-numbering.service';
import { DONATION_TRANSITIONS, assertTransition } from '../common/alumni-state';
import { BusinessException } from '../common/business-exception';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
} from '../common/pagination.util';
import { localToday, parseDateTime } from '../common/time.util';
import { isUniqueViolation } from '../common/unique-violation.util';
import { AlumniNotificationService } from '../notifications/alumni-notification.service';
import { recomputeCampaignTotal } from './campaigns.service';
import {
  ConfirmDonationDto,
  CreateDonationDto,
  DonationReasonDto,
  QueryDonationDto,
  ReverseDonationDto,
} from './dto/fundraising.dto';

const CLOCK_SKEW_MS = 5 * 60 * 1000;
const TX_OPTIONS = { timeout: 15_000 } as const;

const DONOR_SELECT = {
  alumni_id: true,
  full_name: true,
  batch_year: true,
  program: true,
} satisfies Prisma.AlumniProfileSelect;

const STAFF_DONOR_SELECT = {
  ...DONOR_SELECT,
  email: true,
  phone: true,
} satisfies Prisma.AlumniProfileSelect;

const CAMPAIGN_BRIEF = {
  campaign_id: true,
  title: true,
  status: true,
} satisfies Prisma.AlumniCampaignSelect;

interface ReceiveInput {
  transaction_ref?: string;
  payment_mode?: AlumniDonation['payment_mode'];
  received_on?: string;
}

/**
 * Donations.
 *
 * Money never becomes "received" because a client says so: there is no payment
 * gateway in this backend, so an alumnus can only PLEDGE (`pending`, optionally
 * quoting a reference), and alumni-office staff mark the donation `received`
 * after the money has arrived (`POST donations/:id/confirm`, or
 * `mark_received` at creation). Receiving is a single transaction that
 * locks the donation and its campaign, issues the receipt number, and
 * re-derives the campaign total from the ledger. A received donation is
 * immutable; the only way to undo it is an audited `reverse`.
 */
@Injectable()
export class DonationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AlumniLookupService,
    private readonly audit: AlumniAuditService,
    private readonly notifications: AlumniNotificationService,
    private readonly numbering: AlumniNumberingService,
    private readonly access: AlumniAccessService,
  ) {}

  // ─── Create (pledge, or staff-recorded receipt) ──────────────────────────

  async create(actor: AlumniPlatformUser, dto: CreateDonationDto) {
    let alumniId: number;
    if (isAlumniPrincipal(actor)) {
      if (dto.alumni_id !== undefined && dto.alumni_id !== actor.alumni_id) {
        throw new ForbiddenException('You can only donate as yourself');
      }
      if (dto.mark_received) {
        throw new ForbiddenException(
          'Only alumni-office staff can record a donation as received',
        );
      }
      if (!actor.alumni_verified) {
        throw new ForbiddenException(
          'Your alumni profile must be verified before you can donate',
        );
      }
      alumniId = actor.alumni_id as number;
    } else {
      if (dto.alumni_id === undefined) {
        throw new BusinessException(
          'ALUMNI_ID_REQUIRED',
          'alumni_id is required when recording a donation on behalf of an alumnus',
          undefined,
          400,
        );
      }
      alumniId = dto.alumni_id;
      if (dto.mark_received) {
        await this.access.assertPermission(
          actor,
          'donations',
          'confirm',
          "Recording a donation as received needs the 'confirm' permission on 'donations'",
        );
        if (!dto.transaction_ref) {
          throw new BusinessException(
            'TRANSACTION_REF_REQUIRED',
            'transaction_ref is required to record a donation as received',
            undefined,
            400,
          );
        }
      }
    }
    const donor = await this.lookup.profile(actor.institute_id, alumniId);
    if (!donor.is_active) {
      throw new BusinessException(
        'ALUMNI_INACTIVE',
        'This alumni profile is deactivated',
      );
    }
    if (dto.campaign_id !== undefined) {
      await this.assertCampaignAcceptsDonations(
        actor.institute_id,
        dto.campaign_id,
      );
    }

    const amount = new Prisma.Decimal(dto.amount);
    let donation: AlumniDonation;
    try {
      donation = await this.prisma.$transaction(async (tx) => {
        const pending = await tx.alumniDonation.create({
          data: {
            institute_id: actor.institute_id,
            alumni_id: alumniId,
            campaign_id: dto.campaign_id,
            amount,
            payment_mode: dto.payment_mode,
            transaction_ref: dto.transaction_ref,
            is_anonymous: dto.is_anonymous ?? false,
            notes: dto.notes,
            recorded_by: actor.eddva_user_id,
          },
        });
        if (!dto.mark_received) return pending;
        return this.receiveInTx(tx, actor, pending.donation_id, {
          received_on: dto.received_on,
        });
      }, TX_OPTIONS);
    } catch (err) {
      throw this.translateUnique(err);
    }

    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.DONATION,
      entityId: String(donation.donation_id),
      action: 'create',
      newStatus: donation.status,
      metadata: {
        alumni_id: alumniId,
        campaign_id: dto.campaign_id ?? null,
        amount: amount.toFixed(2),
        payment_mode: dto.payment_mode,
        is_anonymous: donation.is_anonymous,
      },
    });
    if (donation.status === 'received') {
      await this.afterReceived(actor, donation, donor.email);
    } else {
      await this.notifications.notifyAlumni(
        {
          instituteId: actor.institute_id,
          entityType: ALUMNI_ENTITY.DONATION,
          entityId: donation.donation_id,
          eventType: 'donation_pledged',
          message: `Thank you! Your pledge of ${amount.toFixed(2)} is awaiting confirmation by the alumni office.`,
        },
        { alumni_id: alumniId, email: donor.email },
      );
      await this.notifications.notifyStaff({
        instituteId: actor.institute_id,
        entityType: ALUMNI_ENTITY.DONATION,
        entityId: donation.donation_id,
        eventType: 'donation_pending_confirmation',
        message: `${donor.full_name} pledged ${amount.toFixed(2)} (${dto.payment_mode}); confirm once the money is received.`,
      });
    }
    return donation;
  }

  private async assertCampaignAcceptsDonations(
    instituteId: string,
    campaignId: number,
  ) {
    const campaign = await this.lookup.campaign(instituteId, campaignId);
    const today = localToday().getTime();
    if (campaign.status !== 'active') {
      throw new BusinessException(
        'CAMPAIGN_NOT_ACTIVE',
        `This campaign is ${campaign.status} and no longer accepts donations`,
        { status: campaign.status },
      );
    }
    if (campaign.start_date.getTime() > today) {
      throw new BusinessException(
        'CAMPAIGN_NOT_STARTED',
        'This campaign has not started yet',
        { start_date: campaign.start_date },
      );
    }
    if (campaign.end_date.getTime() < today) {
      throw new BusinessException('CAMPAIGN_ENDED', 'This campaign has ended', {
        end_date: campaign.end_date,
      });
    }
  }

  private translateUnique(err: unknown): unknown {
    if (isUniqueViolation(err)) {
      return new BusinessException(
        'TRANSACTION_REF_USED',
        'This payment reference is already attached to another live donation',
        undefined,
        409,
      );
    }
    return err;
  }

  // ─── Receive / fail / cancel / reverse ───────────────────────────────────

  /**
   * pending → received, inside the caller's transaction. Lock order is always
   * donation → campaign. Everything that must be atomic happens here: status
   * compare-and-set, receipt number, and the campaign total re-derivation.
   */
  private async receiveInTx(
    tx: Prisma.TransactionClient,
    actor: AlumniPlatformUser,
    donationId: number,
    input: ReceiveInput,
  ): Promise<AlumniDonation> {
    await this.lookup.lock(tx, 'donation', actor.institute_id, donationId);
    const donation = await this.lookup.donation(
      actor.institute_id,
      donationId,
      tx,
    );
    if (donation.status !== 'pending') {
      throw new BusinessException(
        'DONATION_NOT_PENDING',
        `A donation in status "${donation.status}" cannot be confirmed`,
        { status: donation.status },
        409,
      );
    }
    const reference = input.transaction_ref ?? donation.transaction_ref;
    if (!reference) {
      throw new BusinessException(
        'TRANSACTION_REF_REQUIRED',
        'A transaction reference is required to confirm a donation',
        undefined,
        400,
      );
    }
    const receivedAt = input.received_on
      ? parseDateTime(input.received_on, 'received_on')
      : new Date();
    if (receivedAt.getTime() > Date.now() + CLOCK_SKEW_MS) {
      throw new BusinessException(
        'INVALID_RECEIVED_DATE',
        'received_on cannot be in the future',
      );
    }
    if (donation.campaign_id !== null) {
      await this.lookup.lock(
        tx,
        'campaign',
        actor.institute_id,
        donation.campaign_id,
      );
      const campaign = await this.lookup.campaign(
        actor.institute_id,
        donation.campaign_id,
        tx,
      );
      if (campaign.status === 'closed') {
        throw new BusinessException(
          'CAMPAIGN_CLOSED',
          'This campaign is closed; cancel the pledge or record it as a general donation',
        );
      }
    }
    const receiptNumber = await this.numbering.next(
      'DONATION_RECEIPT',
      tx,
      receivedAt,
    );
    const { count } = await tx.alumniDonation.updateMany({
      where: { donation_id: donationId, status: 'pending' },
      data: {
        status: 'received',
        transaction_ref: reference,
        payment_mode: input.payment_mode ?? donation.payment_mode,
        donation_date: receivedAt,
        received_at: receivedAt,
        received_by: actor.eddva_user_id,
        receipt_number: receiptNumber,
        receipt_issued_at: new Date(),
      },
    });
    if (count === 0) {
      throw new BusinessException(
        'DONATION_NOT_PENDING',
        'This donation changed while being confirmed; refresh and retry',
        undefined,
        409,
      );
    }
    if (donation.campaign_id !== null) {
      await recomputeCampaignTotal(tx, donation.campaign_id);
    }
    return tx.alumniDonation.findUniqueOrThrow({
      where: { donation_id: donationId },
    });
  }

  private async afterReceived(
    actor: AlumniPlatformUser,
    donation: AlumniDonation,
    donorEmail: string,
  ) {
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.DONATION,
      entityId: String(donation.donation_id),
      action: 'receive',
      oldStatus: 'pending',
      newStatus: 'received',
      metadata: {
        amount: donation.amount.toFixed(2),
        campaign_id: donation.campaign_id,
        transaction_ref: donation.transaction_ref,
      },
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.DONATION,
      entityId: String(donation.donation_id),
      action: 'receipt_issued',
      metadata: { receipt_number: donation.receipt_number },
    });
    const base = {
      instituteId: actor.institute_id,
      entityType: ALUMNI_ENTITY.DONATION,
      entityId: donation.donation_id,
    };
    await this.notifications.notifyAlumni(
      {
        ...base,
        eventType: 'donation_confirmed',
        message: `We received your donation of ${donation.amount.toFixed(2)}. Thank you!`,
      },
      { alumni_id: donation.alumni_id, email: donorEmail },
    );
    await this.notifications.notifyAlumni(
      {
        ...base,
        eventType: 'donation_receipt',
        message: `Your donation receipt ${donation.receipt_number} is ready.`,
      },
      { alumni_id: donation.alumni_id },
    );
  }

  async confirm(
    actor: AlumniPlatformUser,
    id: number,
    dto: ConfirmDonationDto,
  ) {
    await this.lookup.donation(actor.institute_id, id);
    let donation: AlumniDonation;
    try {
      donation = await this.prisma.$transaction(
        (tx) => this.receiveInTx(tx, actor, id, dto),
        TX_OPTIONS,
      );
    } catch (err) {
      throw this.translateUnique(err);
    }
    const donor = await this.lookup.profile(
      actor.institute_id,
      donation.alumni_id,
    );
    await this.afterReceived(actor, donation, donor.email);
    return donation;
  }

  /** Staff: the money never arrived → pending → failed. */
  async fail(actor: AlumniPlatformUser, id: number, dto: DonationReasonDto) {
    return this.closePending(actor, id, 'failed', dto.reason);
  }

  /** Donor (own pledge) or staff: withdraw a pledge → pending → cancelled. */
  async cancel(actor: AlumniPlatformUser, id: number, dto: DonationReasonDto) {
    const donation = await this.lookup.donation(actor.institute_id, id);
    if (isAlumniPrincipal(actor) && donation.alumni_id !== actor.alumni_id) {
      throw new NotFoundException(`Donation #${id} not found`);
    }
    return this.closePending(actor, id, 'cancelled', dto.reason);
  }

  private async closePending(
    actor: AlumniPlatformUser,
    id: number,
    to: 'failed' | 'cancelled',
    reason: string | undefined,
  ) {
    const donation = await this.lookup.donation(actor.institute_id, id);
    assertTransition(DONATION_TRANSITIONS, donation.status, to, 'The donation');
    const { count } = await this.prisma.alumniDonation.updateMany({
      where: { donation_id: id, status: 'pending' },
      data: { status: to, status_reason: reason },
    });
    if (count === 0) {
      throw new BusinessException(
        'DONATION_NOT_PENDING',
        'This donation changed meanwhile; refresh and retry',
        undefined,
        409,
      );
    }
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.DONATION,
      entityId: String(id),
      action: to === 'failed' ? 'fail' : 'cancel',
      oldStatus: 'pending',
      newStatus: to,
      reason,
    });
    return this.lookup.donation(actor.institute_id, id);
  }

  /** Audited correction of a received donation (bounced cheque, duplicate entry…). The receipt number is kept and voided. */
  async reverse(
    actor: AlumniPlatformUser,
    id: number,
    dto: ReverseDonationDto,
  ) {
    const existing = await this.lookup.donation(actor.institute_id, id);
    assertTransition(
      DONATION_TRANSITIONS,
      existing.status,
      'reversed',
      'The donation',
    );
    const donation = await this.prisma.$transaction(async (tx) => {
      await this.lookup.lock(tx, 'donation', actor.institute_id, id);
      const { count } = await tx.alumniDonation.updateMany({
        where: { donation_id: id, status: 'received' },
        data: {
          status: 'reversed',
          status_reason: dto.reason,
          reversed_at: new Date(),
          reversed_by: actor.eddva_user_id,
        },
      });
      if (count === 0) {
        throw new BusinessException(
          'DONATION_NOT_RECEIVED',
          'This donation is no longer in a received state',
          undefined,
          409,
        );
      }
      if (existing.campaign_id !== null) {
        await this.lookup.lock(
          tx,
          'campaign',
          actor.institute_id,
          existing.campaign_id,
        );
        await recomputeCampaignTotal(tx, existing.campaign_id);
      }
      return tx.alumniDonation.findUniqueOrThrow({
        where: { donation_id: id },
      });
    }, TX_OPTIONS);
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.DONATION,
      entityId: String(id),
      action: 'reverse',
      oldStatus: 'received',
      newStatus: 'reversed',
      reason: dto.reason,
      metadata: {
        amount: donation.amount.toFixed(2),
        receipt_number: donation.receipt_number,
        campaign_id: donation.campaign_id,
      },
    });
    const donor = await this.lookup.profile(
      actor.institute_id,
      donation.alumni_id,
    );
    await this.notifications.notifyAlumni(
      {
        instituteId: actor.institute_id,
        entityType: ALUMNI_ENTITY.DONATION,
        entityId: id,
        eventType: 'donation_reversed',
        message: `Your donation (receipt ${donation.receipt_number}) was reversed: ${dto.reason}`,
      },
      { alumni_id: donation.alumni_id, email: donor.email },
    );
    return donation;
  }

  // ─── Reads ───────────────────────────────────────────────────────────────

  private where(
    actor: AlumniPlatformUser,
    query: QueryDonationDto,
    forcedAlumniId?: number,
  ): Prisma.AlumniDonationWhereInput {
    const range = buildDateRange(query.from, query.to);
    return {
      institute_id: actor.institute_id,
      campaign_id: query.general_only ? null : query.campaign_id,
      status: query.status,
      payment_mode: query.payment_mode,
      alumni_id: isAlumniPrincipal(actor)
        ? actor.alumni_id
        : (forcedAlumniId ?? query.alumni_id),
      ...(range ? { donation_date: range } : {}),
    };
  }

  /** Alumni: their own donations. Staff: all, filterable by campaign / donor / status / mode / dates. */
  async findAll(actor: AlumniPlatformUser, query: QueryDonationDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where = this.where(actor, query);
    const staff = !isAlumniPrincipal(actor);
    const [rows, total, sum] = await this.prisma.$transaction([
      this.prisma.alumniDonation.findMany({
        where,
        orderBy: [{ donation_date: 'desc' }, { donation_id: 'desc' }],
        skip,
        take,
        include: {
          campaign: { select: CAMPAIGN_BRIEF },
          alumni: { select: staff ? STAFF_DONOR_SELECT : DONOR_SELECT },
        },
      }),
      this.prisma.alumniDonation.count({ where }),
      this.prisma.alumniDonation.aggregate({
        where: { ...where, status: 'received' },
        _sum: { amount: true },
      }),
    ]);
    return {
      data: rows,
      summary: { received_total: Number(sum._sum.amount ?? 0) },
      pagination: buildMeta(total, page, limit),
    };
  }

  async findOne(actor: AlumniPlatformUser, id: number) {
    const row = await this.prisma.alumniDonation.findFirst({
      where: {
        donation_id: id,
        institute_id: actor.institute_id,
        ...(isAlumniPrincipal(actor) ? { alumni_id: actor.alumni_id } : {}),
      },
      include: {
        campaign: { select: CAMPAIGN_BRIEF },
        alumni: {
          select: isAlumniPrincipal(actor) ? DONOR_SELECT : STAFF_DONOR_SELECT,
        },
      },
    });
    if (!row) throw new NotFoundException(`Donation #${id} not found`);
    return row;
  }

  /** One alumnus's giving history with totals — the alumnus themself or staff. */
  async donorHistory(
    actor: AlumniPlatformUser,
    alumniId: number,
    query: QueryDonationDto,
  ) {
    if (isAlumniPrincipal(actor) && actor.alumni_id !== alumniId) {
      throw new ForbiddenException(
        'You can only view your own donation history',
      );
    }
    await this.lookup.profile(actor.institute_id, alumniId);
    const { skip, take, page, limit } = parsePagination(query);
    const base = this.where(actor, query, alumniId);
    // History defaults to money actually received; ask for another status explicitly.
    const where: Prisma.AlumniDonationWhereInput = {
      ...base,
      status: query.status ?? 'received',
    };
    const [rows, total, sum] = await this.prisma.$transaction([
      this.prisma.alumniDonation.findMany({
        where,
        orderBy: [{ donation_date: 'desc' }, { donation_id: 'desc' }],
        skip,
        take,
        include: { campaign: { select: CAMPAIGN_BRIEF } },
      }),
      this.prisma.alumniDonation.count({ where }),
      this.prisma.alumniDonation.aggregate({
        where,
        _sum: { amount: true },
      }),
    ]);
    const byCampaign = await this.prisma.alumniDonation.groupBy({
      by: ['campaign_id'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { campaign_id: 'asc' },
    });
    return {
      alumni_id: alumniId,
      data: rows,
      totals: {
        count: total,
        amount: Number(sum._sum.amount ?? 0),
        by_campaign: byCampaign.map((c) => ({
          campaign_id: c.campaign_id,
          count: c._count._all,
          amount: Number(c._sum?.amount ?? 0),
        })),
      },
      pagination: buildMeta(total, page, limit),
    };
  }

  /**
   * Donations of one campaign. Staff see donors (with the anonymous flag);
   * alumni only see RECEIVED donations and never the identity behind an
   * anonymous one (unless it is their own).
   */
  async campaignDonations(
    actor: AlumniPlatformUser,
    campaignId: number,
    query: QueryDonationDto,
  ) {
    await this.lookup.campaign(actor.institute_id, campaignId);
    const { skip, take, page, limit } = parsePagination(query);
    const staff = !isAlumniPrincipal(actor);
    const range = buildDateRange(query.from, query.to);
    const where: Prisma.AlumniDonationWhereInput = {
      institute_id: actor.institute_id,
      campaign_id: campaignId,
      status: staff ? query.status : 'received',
      payment_mode: query.payment_mode,
      alumni_id: staff ? query.alumni_id : undefined,
      ...(range ? { donation_date: range } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.alumniDonation.findMany({
        where,
        orderBy: [{ donation_date: 'desc' }, { donation_id: 'desc' }],
        skip,
        take,
        include: {
          alumni: { select: staff ? STAFF_DONOR_SELECT : DONOR_SELECT },
        },
      }),
      this.prisma.alumniDonation.count({ where }),
    ]);
    if (staff) {
      return { data: rows, pagination: buildMeta(total, page, limit) };
    }
    return {
      data: rows.map((d) => {
        const own = d.alumni_id === actor.alumni_id;
        return {
          donation_id: d.donation_id,
          amount: d.amount,
          donation_date: d.donation_date,
          is_anonymous: d.is_anonymous,
          donor: !d.is_anonymous || own ? d.alumni : null,
        };
      }),
      pagination: buildMeta(total, page, limit),
    };
  }

  // ─── Receipts ────────────────────────────────────────────────────────────

  /** Receipt content for a received (or since-reversed, shown as void) donation. */
  async receipt(actor: AlumniPlatformUser, id: number) {
    const donation = await this.prisma.alumniDonation.findFirst({
      where: {
        donation_id: id,
        institute_id: actor.institute_id,
        ...(isAlumniPrincipal(actor) ? { alumni_id: actor.alumni_id } : {}),
      },
      include: {
        alumni: { select: STAFF_DONOR_SELECT },
        campaign: { select: CAMPAIGN_BRIEF },
      },
    });
    if (!donation) throw new NotFoundException(`Donation #${id} not found`);
    if (!donation.receipt_number) {
      throw new BusinessException(
        'RECEIPT_NOT_AVAILABLE',
        'A receipt is only issued once the donation has been received',
        { status: donation.status },
      );
    }
    return {
      receipt_number: donation.receipt_number,
      issued_at: donation.receipt_issued_at,
      status:
        donation.status === 'reversed' ? ('void' as const) : ('valid' as const),
      void_reason:
        donation.status === 'reversed' ? donation.status_reason : null,
      institute_id: donation.institute_id,
      donor: {
        alumni_id: donation.alumni.alumni_id,
        name: donation.alumni.full_name,
        batch_year: donation.alumni.batch_year,
        program: donation.alumni.program,
        email: donation.alumni.email,
      },
      donation: {
        donation_id: donation.donation_id,
        amount: donation.amount.toFixed(2),
        campaign: donation.campaign?.title ?? 'General fund',
        donation_date: donation.received_at ?? donation.donation_date,
        payment_mode: donation.payment_mode,
        transaction_ref: donation.transaction_ref,
        is_anonymous: donation.is_anonymous,
      },
    };
  }
}
