import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  CreateAdmissionSessionDto,
  QueryAdmissionSessionDto,
  UpdateAdmissionSessionDto,
} from './dto/session.dto';

const SORT_FIELDS = ['name', 'start_date', 'created_at'] as const;

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AdmissionLookupService,
    private readonly audit: AdmissionAuditService,
  ) {}

  private assertDateOrder(start: Date, end: Date) {
    if (end < start) {
      throw new BusinessException(
        'INVALID_DATE_RANGE',
        'end_date must not be before start_date',
      );
    }
  }

  private async assertNameFree(
    instituteId: string,
    name: string,
    exceptId?: number,
  ) {
    const clash = await this.prisma.admissionAcademicSession.findFirst({
      where: {
        institute_id: instituteId,
        deleted_at: null,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { session_id: { not: exceptId } } : {}),
      },
      select: { session_id: true },
    });
    if (clash) {
      throw new ConflictException(
        `An academic session named "${name}" already exists`,
      );
    }
  }

  async create(actor: AdmissionPlatformUser, dto: CreateAdmissionSessionDto) {
    const start = new Date(dto.start_date);
    const end = new Date(dto.end_date);
    this.assertDateOrder(start, end);
    await this.assertNameFree(actor.institute_id, dto.name);

    const session = await this.prisma.admissionAcademicSession.create({
      data: {
        institute_id: actor.institute_id,
        name: dto.name,
        start_date: start,
        end_date: end,
        status: dto.status ?? 'upcoming',
        created_by: actor.eddva_user_id,
      },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.SESSION,
      entityId: String(session.session_id),
      action: 'create',
      newStatus: session.status,
    });
    return session;
  }

  async findAll(instituteId: string, query: QueryAdmissionSessionDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, 'start_date');
    const where: Prisma.AdmissionAcademicSessionWhereInput = {
      institute_id: instituteId,
      deleted_at: null,
      status: query.status,
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.admissionAcademicSession.findMany({
        where,
        orderBy: { [sortBy]: parseSortOrder(query.sortOrder) },
        skip,
        take,
      }),
      this.prisma.admissionAcademicSession.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  findOne(instituteId: string, id: number) {
    return this.lookup.session(instituteId, id);
  }

  async update(
    actor: AdmissionPlatformUser,
    id: number,
    dto: UpdateAdmissionSessionDto,
  ) {
    const existing = await this.lookup.session(actor.institute_id, id);
    const start = dto.start_date
      ? new Date(dto.start_date)
      : existing.start_date;
    const end = dto.end_date ? new Date(dto.end_date) : existing.end_date;
    this.assertDateOrder(start, end);
    if (dto.name && dto.name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertNameFree(actor.institute_id, dto.name, id);
    }

    const updated = await this.prisma.admissionAcademicSession.update({
      where: { session_id: id },
      data: {
        name: dto.name,
        start_date: dto.start_date ? start : undefined,
        end_date: dto.end_date ? end : undefined,
        status: dto.status,
      },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.SESSION,
      entityId: String(id),
      action: 'update',
      oldStatus: existing.status,
      newStatus: updated.status,
    });
    return updated;
  }

  /** Soft delete. A session that still has applications is history — it can be closed, not deleted. */
  async remove(actor: AdmissionPlatformUser, id: number) {
    await this.lookup.session(actor.institute_id, id);
    const inUse = await this.prisma.admissionApplication.count({
      where: { session_id: id, deleted_at: null },
    });
    if (inUse > 0) {
      throw new ConflictException(
        `Session has ${inUse} application(s). Close it instead of deleting it.`,
      );
    }
    await this.prisma.admissionAcademicSession.update({
      where: { session_id: id },
      data: { deleted_at: new Date() },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.SESSION,
      entityId: String(id),
      action: 'delete',
    });
    return { deleted: true };
  }
}
