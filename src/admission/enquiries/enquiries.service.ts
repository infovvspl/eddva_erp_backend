import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdmissionEnquiryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { AdmissionAuditService } from '../common/admission-audit.service';
import { AdmissionLookupService } from '../common/admission-lookup.service';
import { ADM_ENTITY } from '../common/admission-entities';
import { BusinessException } from '../common/business-exception';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
  parseSort,
  parseSortOrder,
} from '../common/pagination.util';
import { ApplicationsService } from '../applications/applications.service';
import {
  AssignEnquiryDto,
  ChangeEnquiryStatusDto,
  ConvertEnquiryDto,
  CreateAdmissionEnquiryDto,
  CreateFollowupDto,
  QueryAdmissionEnquiryDto,
  UpdateAdmissionEnquiryDto,
  UpdateFollowupDto,
} from './dto/enquiry.dto';

const SORT_FIELDS = ['created_at', 'name', 'status'] as const;

/** `converted` is deliberately not a manual target — only POST /enquiries/:id/convert sets it. */
const ALLOWED_TRANSITIONS: Record<
  AdmissionEnquiryStatus,
  AdmissionEnquiryStatus[]
> = {
  new: ['contacted', 'application_started', 'lost'],
  contacted: ['application_started', 'lost'],
  application_started: ['contacted', 'lost'],
  lost: ['contacted'],
  converted: [],
};

@Injectable()
export class EnquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AdmissionLookupService,
    private readonly applications: ApplicationsService,
    private readonly audit: AdmissionAuditService,
  ) {}

  private assertFollowupDates(followup: Date, next?: Date | null) {
    if (next && next < followup) {
      throw new BusinessException(
        'INVALID_FOLLOWUP_DATES',
        'next_followup_date must not be before followup_date',
      );
    }
  }

  private async assertNotConverted(instituteId: string, id: number) {
    const enquiry = await this.lookup.enquiry(instituteId, id);
    if (enquiry.status === 'converted') {
      throw new BusinessException(
        'ENQUIRY_ALREADY_CONVERTED',
        'This enquiry has already been converted into an application and can no longer be changed.',
        { enquiry_id: id },
        HttpStatus.CONFLICT,
      );
    }
    return enquiry;
  }

  // ─── Enquiry CRUD ─────────────────────────────────────────────────────────

  async create(actor: AdmissionPlatformUser, dto: CreateAdmissionEnquiryDto) {
    if (dto.program_id)
      await this.lookup.program(actor.institute_id, dto.program_id);
    if (dto.assigned_to)
      await this.lookup.staffMember(actor.institute_id, dto.assigned_to);

    const enquiry = await this.prisma.admissionEnquiry.create({
      data: {
        institute_id: actor.institute_id,
        name: dto.name.trim(),
        phone: dto.phone,
        email: dto.email?.toLowerCase(),
        program_id: dto.program_id,
        source: dto.source,
        assigned_to: dto.assigned_to,
        created_by: actor.eddva_user_id,
      },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.ENQUIRY,
      entityId: String(enquiry.enquiry_id),
      action: 'create',
      newStatus: enquiry.status,
      metadata: { source: enquiry.source, assigned_to: enquiry.assigned_to },
    });
    return enquiry;
  }

  async findAll(instituteId: string, query: QueryAdmissionEnquiryDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, 'created_at');

    const where: Prisma.AdmissionEnquiryWhereInput = {
      institute_id: instituteId,
      deleted_at: null,
      status: query.status,
      source: query.source,
      program_id: query.program_id,
      assigned_to: query.assigned_to,
      created_at: buildDateRange(query.from, query.to),
      ...(query.followup_due
        ? {
            status: { in: ['new', 'contacted', 'application_started'] },
            followups: {
              some: { next_followup_date: { lte: new Date() } },
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.admissionEnquiry.findMany({
        where,
        orderBy: { [sortBy]: parseSortOrder(query.sortOrder) },
        skip,
        take,
        include: {
          program: { select: { program_id: true, name: true } },
          _count: { select: { followups: true } },
          followups: {
            select: { next_followup_date: true },
            orderBy: { followup_date: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.admissionEnquiry.count({ where }),
    ]);

    return {
      data: data.map(({ followups, ...row }) => ({
        ...row,
        next_followup_date: followups[0]?.next_followup_date ?? null,
      })),
      pagination: buildMeta(total, page, limit),
    };
  }

  async findOne(instituteId: string, id: number) {
    const enquiry = await this.prisma.admissionEnquiry.findFirst({
      where: { enquiry_id: id, institute_id: instituteId, deleted_at: null },
      include: {
        program: { select: { program_id: true, name: true } },
        followups: {
          orderBy: [{ followup_date: 'desc' }, { followup_id: 'desc' }],
        },
        application: {
          select: {
            application_id: true,
            application_number: true,
            status: true,
          },
        },
      },
    });
    if (!enquiry) throw new NotFoundException(`Enquiry #${id} not found`);
    return enquiry;
  }

  async update(
    actor: AdmissionPlatformUser,
    id: number,
    dto: UpdateAdmissionEnquiryDto,
  ) {
    await this.assertNotConverted(actor.institute_id, id);
    if (dto.program_id)
      await this.lookup.program(actor.institute_id, dto.program_id);

    const updated = await this.prisma.admissionEnquiry.update({
      where: { enquiry_id: id },
      data: {
        name: dto.name?.trim(),
        phone: dto.phone,
        email: dto.email?.toLowerCase(),
        program_id: dto.program_id,
        source: dto.source,
      },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.ENQUIRY,
      entityId: String(id),
      action: 'update',
      metadata: { changed_fields: Object.keys(dto) },
    });
    return updated;
  }

  async assign(
    actor: AdmissionPlatformUser,
    id: number,
    dto: AssignEnquiryDto,
  ) {
    const enquiry = await this.assertNotConverted(actor.institute_id, id);
    const staff = await this.lookup.staffMember(
      actor.institute_id,
      dto.assigned_to,
    );

    const updated = await this.prisma.admissionEnquiry.update({
      where: { enquiry_id: id },
      data: { assigned_to: dto.assigned_to },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.ENQUIRY,
      entityId: String(id),
      action: 'assign',
      metadata: {
        from: enquiry.assigned_to,
        to: dto.assigned_to,
        assignee_name: staff.user_name,
      },
    });
    return updated;
  }

  async changeStatus(
    actor: AdmissionPlatformUser,
    id: number,
    dto: ChangeEnquiryStatusDto,
  ) {
    const enquiry = await this.lookup.enquiry(actor.institute_id, id);
    const allowed = ALLOWED_TRANSITIONS[enquiry.status];
    if (!allowed.includes(dto.status)) {
      throw new BusinessException(
        'INVALID_STATUS_TRANSITION',
        dto.status === 'converted'
          ? 'An enquiry becomes "converted" only by converting it into an application.'
          : `An enquiry cannot move from "${enquiry.status}" to "${dto.status}".`,
        { from: enquiry.status, to: dto.status, allowed },
      );
    }

    const moved = await this.prisma.admissionEnquiry.updateMany({
      where: { enquiry_id: id, status: enquiry.status },
      data: { status: dto.status },
    });
    if (moved.count === 0) {
      throw new BusinessException(
        'ENQUIRY_STATUS_CONFLICT',
        'Another user has already updated this enquiry. Refresh and try again.',
        { enquiry_id: id },
        HttpStatus.CONFLICT,
      );
    }
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.ENQUIRY,
      entityId: String(id),
      action: 'status_change',
      oldStatus: enquiry.status,
      newStatus: dto.status,
    });
    return this.lookup.enquiry(actor.institute_id, id);
  }

  /** Soft delete. A converted enquiry is the audit anchor of its application and cannot be deleted. */
  async remove(actor: AdmissionPlatformUser, id: number) {
    await this.assertNotConverted(actor.institute_id, id);
    await this.prisma.admissionEnquiry.update({
      where: { enquiry_id: id },
      data: { deleted_at: new Date() },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.ENQUIRY,
      entityId: String(id),
      action: 'delete',
    });
    return { deleted: true };
  }

  // ─── Follow-ups ───────────────────────────────────────────────────────────

  async addFollowup(
    actor: AdmissionPlatformUser,
    id: number,
    dto: CreateFollowupDto,
  ) {
    const enquiry = await this.assertNotConverted(actor.institute_id, id);
    const followupDate = new Date(dto.followup_date);
    const next = dto.next_followup_date
      ? new Date(dto.next_followup_date)
      : null;
    this.assertFollowupDates(followupDate, next);

    const followup = await this.prisma.$transaction(async (tx) => {
      const created = await tx.admissionEnquiryFollowup.create({
        data: {
          enquiry_id: id,
          notes: dto.notes,
          followup_date: followupDate,
          next_followup_date: next,
          updated_by: actor.eddva_user_id,
        },
      });
      // First real contact moves a brand-new enquiry to "contacted" (guarded against a concurrent status change).
      if (enquiry.status === 'new') {
        await tx.admissionEnquiry.updateMany({
          where: { enquiry_id: id, status: 'new' },
          data: { status: 'contacted' },
        });
      }
      return created;
    });

    await this.audit.log(actor, {
      entityType: ADM_ENTITY.ENQUIRY_FOLLOWUP,
      entityId: String(followup.followup_id),
      action: 'create',
      metadata: {
        enquiry_id: id,
        next_followup_date: dto.next_followup_date ?? null,
      },
    });
    return followup;
  }

  async listFollowups(instituteId: string, id: number) {
    await this.lookup.enquiry(instituteId, id);
    return this.prisma.admissionEnquiryFollowup.findMany({
      where: { enquiry_id: id },
      orderBy: [{ followup_date: 'desc' }, { followup_id: 'desc' }],
    });
  }

  async updateFollowup(
    actor: AdmissionPlatformUser,
    id: number,
    followupId: number,
    dto: UpdateFollowupDto,
  ) {
    await this.assertNotConverted(actor.institute_id, id);
    const existing = await this.prisma.admissionEnquiryFollowup.findFirst({
      where: { followup_id: followupId, enquiry_id: id },
    });
    if (!existing)
      throw new NotFoundException(`Follow-up #${followupId} not found`);

    const followupDate = dto.followup_date
      ? new Date(dto.followup_date)
      : existing.followup_date;
    const next =
      dto.next_followup_date !== undefined
        ? new Date(dto.next_followup_date)
        : existing.next_followup_date;
    this.assertFollowupDates(followupDate, next);

    const updated = await this.prisma.admissionEnquiryFollowup.update({
      where: { followup_id: followupId },
      data: {
        notes: dto.notes,
        followup_date: dto.followup_date ? followupDate : undefined,
        next_followup_date: dto.next_followup_date ? next : undefined,
        updated_by: actor.eddva_user_id,
      },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.ENQUIRY_FOLLOWUP,
      entityId: String(followupId),
      action: 'update',
      metadata: { enquiry_id: id, changed_fields: Object.keys(dto) },
    });
    return updated;
  }

  // ─── Convert ──────────────────────────────────────────────────────────────

  /**
   * Enquiry → application. Delegates to ApplicationsService.create so the
   * applicant create/reuse, application number, source_enquiry_id link and the
   * enquiry → converted move all happen in one transaction.
   */
  async convert(
    actor: AdmissionPlatformUser,
    id: number,
    dto: ConvertEnquiryDto,
  ) {
    const enquiry = await this.lookup.enquiry(actor.institute_id, id);
    const programId = dto.program_id ?? enquiry.program_id;
    if (!programId) {
      throw new BadRequestException(
        'program_id is required: the enquiry has no interested program',
      );
    }

    return this.applications.create(actor, {
      session_id: dto.session_id,
      program_id: programId,
      application_date: dto.application_date,
      source_enquiry_id: id,
      ...(dto.applicant_id
        ? { applicant_id: dto.applicant_id }
        : {
            applicant: {
              name: enquiry.name,
              phone: enquiry.phone,
              email: enquiry.email ?? undefined,
              ...dto.applicant_details,
            },
          }),
    });
  }
}
