import { HttpStatus, Injectable } from '@nestjs/common';
import { AdmissionApplicant, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { AdmissionAuditService } from '../common/admission-audit.service';
import { AdmissionLookupService } from '../common/admission-lookup.service';
import { ADM_ENTITY } from '../common/admission-entities';
import { BusinessException } from '../common/business-exception';
import {
  buildMeta,
  parsePagination,
  parseSort,
  parseSortOrder,
} from '../common/pagination.util';
import {
  CreateApplicantDto,
  QueryApplicantDto,
  UpdateApplicantDto,
} from './dto/applicant.dto';

const SORT_FIELDS = ['name', 'created_at'] as const;

const isSameDay = (a: Date, b: Date) =>
  a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

@Injectable()
export class ApplicantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AdmissionLookupService,
    private readonly audit: AdmissionAuditService,
  ) {}

  /**
   * Existing person matching the input: same name (case-insensitive) and the
   * same phone or email, and — when both sides know a date of birth — the same
   * DOB. Used to avoid creating a second applicant for the same person.
   */
  async findDuplicate(
    db: Prisma.TransactionClient,
    instituteId: string,
    input: Pick<CreateApplicantDto, 'name' | 'phone' | 'email' | 'dob'>,
  ): Promise<AdmissionApplicant | undefined> {
    const contact: Prisma.AdmissionApplicantWhereInput[] = [
      { phone: input.phone },
    ];
    if (input.email) {
      contact.push({ email: { equals: input.email, mode: 'insensitive' } });
    }
    const candidates = await db.admissionApplicant.findMany({
      where: {
        institute_id: instituteId,
        deleted_at: null,
        name: { equals: input.name.trim(), mode: 'insensitive' },
        OR: contact,
      },
      take: 10,
    });
    const dob = input.dob ? new Date(input.dob) : undefined;
    return candidates.find((c) => !dob || !c.dob || isSameDay(c.dob, dob));
  }

  /**
   * Serialises creation of "the same person" for the rest of the transaction.
   * The duplicate check is check-then-insert, so without this two simultaneous
   * submissions of one new person could each pass it and create two applicants
   * (which the per-applicant unique index on applications cannot catch). The
   * lock is keyed on institute + normalised name only, so unrelated people never
   * contend, and it is released automatically at commit/rollback.
   */
  private async lockPerson(
    db: Prisma.TransactionClient,
    instituteId: string,
    name: string,
  ) {
    const key = `admission-applicant|${instituteId}|${name.trim().toLowerCase()}`;
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }

  /** Creates the applicant unless the same person already exists, in which case that record is reused. */
  async createOrReuse(
    db: Prisma.TransactionClient,
    actor: AdmissionPlatformUser,
    input: CreateApplicantDto,
  ): Promise<{ applicant: AdmissionApplicant; reused: boolean }> {
    await this.lockPerson(db, actor.institute_id, input.name);
    const duplicate = await this.findDuplicate(db, actor.institute_id, input);
    if (duplicate) return { applicant: duplicate, reused: true };

    const applicant = await db.admissionApplicant.create({
      data: this.toCreateData(input, actor),
    });
    return { applicant, reused: false };
  }

  private toCreateData(
    input: CreateApplicantDto,
    actor: AdmissionPlatformUser,
  ): Prisma.AdmissionApplicantUncheckedCreateInput {
    return {
      institute_id: actor.institute_id,
      created_by: actor.eddva_user_id,
      ...this.toUpdateData(input),
      name: input.name.trim(),
      phone: input.phone,
    };
  }

  private toUpdateData(input: Partial<CreateApplicantDto>) {
    return {
      name: input.name?.trim(),
      dob: input.dob ? new Date(input.dob) : undefined,
      gender: input.gender,
      email: input.email?.toLowerCase(),
      phone: input.phone,
      address: input.address,
      guardian_name: input.guardian_name,
      guardian_contact: input.guardian_contact,
      photo_url: input.photo_url,
    };
  }

  async create(actor: AdmissionPlatformUser, dto: CreateApplicantDto) {
    const applicant = await this.prisma.$transaction(async (tx) => {
      await this.lockPerson(tx, actor.institute_id, dto.name);
      const duplicate = await this.findDuplicate(tx, actor.institute_id, dto);
      if (duplicate) {
        throw new BusinessException(
          'DUPLICATE_APPLICANT',
          'An applicant with the same name and contact details already exists. Use the existing applicant.',
          { existing_applicant_id: duplicate.applicant_id },
          HttpStatus.CONFLICT,
        );
      }
      return tx.admissionApplicant.create({
        data: this.toCreateData(dto, actor),
      });
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.APPLICANT,
      entityId: String(applicant.applicant_id),
      action: 'create',
    });
    return applicant;
  }

  async findAll(instituteId: string, query: QueryApplicantDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, 'created_at');
    const where: Prisma.AdmissionApplicantWhereInput = {
      institute_id: instituteId,
      deleted_at: null,
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
      this.prisma.admissionApplicant.findMany({
        where,
        orderBy: { [sortBy]: parseSortOrder(query.sortOrder) },
        skip,
        take,
      }),
      this.prisma.admissionApplicant.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    await this.lookup.applicant(instituteId, id);
    return this.prisma.admissionApplicant.findUniqueOrThrow({
      where: { applicant_id: id },
      include: {
        applications: {
          where: { deleted_at: null },
          select: {
            application_id: true,
            application_number: true,
            status: true,
            application_date: true,
            session: { select: { session_id: true, name: true } },
            program: { select: { program_id: true, name: true } },
          },
          orderBy: { application_date: 'desc' },
        },
      },
    });
  }

  async update(
    actor: AdmissionPlatformUser,
    id: number,
    dto: UpdateApplicantDto,
  ) {
    await this.lookup.applicant(actor.institute_id, id);
    const updated = await this.prisma.admissionApplicant.update({
      where: { applicant_id: id },
      data: this.toUpdateData(dto),
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.APPLICANT,
      entityId: String(id),
      action: 'update',
      metadata: { changed_fields: Object.keys(dto) },
    });
    return updated;
  }
}
