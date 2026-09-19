import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { AdmissionAuditService } from '../common/admission-audit.service';
import { AdmissionLookupService } from '../common/admission-lookup.service';
import { AdmissionSeatsService } from '../common/admission-seats.service';
import { ADM_ENTITY } from '../common/admission-entities';
import { BusinessException } from '../common/business-exception';
import {
  buildMeta,
  parsePagination,
  parseSort,
  parseSortOrder,
} from '../common/pagination.util';
import {
  CreateAdmissionProgramDto,
  QueryAdmissionProgramDto,
  UpdateAdmissionProgramDto,
} from './dto/program.dto';

const SORT_FIELDS = ['name', 'level', 'total_seats', 'created_at'] as const;

@Injectable()
export class ProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AdmissionLookupService,
    private readonly seats: AdmissionSeatsService,
    private readonly audit: AdmissionAuditService,
  ) {}

  private async assertNameFree(
    instituteId: string,
    name: string,
    exceptId?: number,
  ) {
    const clash = await this.prisma.admissionProgram.findFirst({
      where: {
        institute_id: instituteId,
        deleted_at: null,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { program_id: { not: exceptId } } : {}),
      },
      select: { program_id: true },
    });
    if (clash) {
      throw new ConflictException(`A program named "${name}" already exists`);
    }
  }

  async create(actor: AdmissionPlatformUser, dto: CreateAdmissionProgramDto) {
    await this.assertNameFree(actor.institute_id, dto.name);
    const program = await this.prisma.admissionProgram.create({
      data: {
        institute_id: actor.institute_id,
        name: dto.name,
        level: dto.level,
        total_seats: dto.total_seats,
        eligibility_criteria: dto.eligibility_criteria,
        created_by: actor.eddva_user_id,
      },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.PROGRAM,
      entityId: String(program.program_id),
      action: 'create',
      metadata: { total_seats: program.total_seats },
    });
    return program;
  }

  async findAll(instituteId: string, query: QueryAdmissionProgramDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, 'name');
    const where: Prisma.AdmissionProgramWhereInput = {
      institute_id: instituteId,
      deleted_at: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { level: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.admissionProgram.findMany({
        where,
        orderBy: { [sortBy]: parseSortOrder(query.sortOrder ?? 'asc') },
        skip,
        take,
      }),
      this.prisma.admissionProgram.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  findOne(instituteId: string, id: number) {
    return this.lookup.program(instituteId, id);
  }

  async update(
    actor: AdmissionPlatformUser,
    id: number,
    dto: UpdateAdmissionProgramDto,
  ) {
    const existing = await this.lookup.program(actor.institute_id, id);
    if (dto.name && dto.name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertNameFree(actor.institute_id, dto.name, id);
    }
    if (
      dto.total_seats !== undefined &&
      dto.total_seats < existing.total_seats
    ) {
      const held = await this.seats.maxHeldAcrossSessions(id);
      if (dto.total_seats < held) {
        throw new BusinessException(
          'SEATS_BELOW_COMMITMENTS',
          `Cannot reduce seats to ${dto.total_seats}: ${held} seat(s) are already held by offers/admissions.`,
          { requested: dto.total_seats, held },
        );
      }
    }

    const updated = await this.prisma.admissionProgram.update({
      where: { program_id: id },
      data: {
        name: dto.name,
        level: dto.level,
        total_seats: dto.total_seats,
        eligibility_criteria: dto.eligibility_criteria,
      },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.PROGRAM,
      entityId: String(id),
      action: 'update',
      metadata: {
        total_seats: { from: existing.total_seats, to: updated.total_seats },
      },
    });
    return updated;
  }

  /** Soft delete. A program that still has applications or enquiries is history and cannot be deleted. */
  async remove(actor: AdmissionPlatformUser, id: number) {
    await this.lookup.program(actor.institute_id, id);
    const [applications, enquiries] = await Promise.all([
      this.prisma.admissionApplication.count({
        where: { program_id: id, deleted_at: null },
      }),
      this.prisma.admissionEnquiry.count({
        where: { program_id: id, deleted_at: null },
      }),
    ]);
    if (applications + enquiries > 0) {
      throw new ConflictException(
        `Program is referenced by ${applications} application(s) and ${enquiries} enquiry(ies) and cannot be deleted.`,
      );
    }
    await this.prisma.admissionProgram.update({
      where: { program_id: id },
      data: { deleted_at: new Date() },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.PROGRAM,
      entityId: String(id),
      action: 'delete',
    });
    return { deleted: true };
  }
}
