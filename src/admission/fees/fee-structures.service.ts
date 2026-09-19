import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { AdmissionAuditService } from '../common/admission-audit.service';
import { AdmissionLookupService } from '../common/admission-lookup.service';
import { ADM_ENTITY } from '../common/admission-entities';
import { buildMeta, parsePagination } from '../common/pagination.util';
import {
  CreateFeeStructureDto,
  QueryFeeStructureDto,
  UpdateFeeStructureDto,
} from './dto/fee.dto';

const INCLUDE = {
  program: { select: { program_id: true, name: true } },
  session: { select: { session_id: true, name: true } },
} satisfies Prisma.AdmissionFeeStructureInclude;

@Injectable()
export class FeeStructuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AdmissionLookupService,
    private readonly audit: AdmissionAuditService,
  ) {}

  async create(actor: AdmissionPlatformUser, dto: CreateFeeStructureDto) {
    await this.lookup.program(actor.institute_id, dto.program_id);
    await this.lookup.session(actor.institute_id, dto.session_id);

    const existing = await this.prisma.admissionFeeStructure.findUnique({
      where: {
        program_id_session_id: {
          program_id: dto.program_id,
          session_id: dto.session_id,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'A fee structure already exists for this program and session. Update it instead.',
      );
    }
    const structure = await this.prisma.admissionFeeStructure.create({
      data: {
        institute_id: actor.institute_id,
        program_id: dto.program_id,
        session_id: dto.session_id,
        amount: new Prisma.Decimal(dto.amount),
        due_date: new Date(dto.due_date),
        created_by: actor.eddva_user_id,
      },
      include: INCLUDE,
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.FEE_STRUCTURE,
      entityId: String(structure.fee_structure_id),
      action: 'create',
      metadata: { amount: structure.amount.toString() },
    });
    return structure;
  }

  async findAll(instituteId: string, query: QueryFeeStructureDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.AdmissionFeeStructureWhereInput = {
      institute_id: instituteId,
      program_id: query.program_id,
      session_id: query.session_id,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.admissionFeeStructure.findMany({
        where,
        include: INCLUDE,
        orderBy: { due_date: 'desc' },
        skip,
        take,
      }),
      this.prisma.admissionFeeStructure.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const structure = await this.prisma.admissionFeeStructure.findFirst({
      where: { fee_structure_id: id, institute_id: instituteId },
      include: INCLUDE,
    });
    if (!structure)
      throw new NotFoundException(`Fee structure #${id} not found`);
    return structure;
  }

  async update(
    actor: AdmissionPlatformUser,
    id: number,
    dto: UpdateFeeStructureDto,
  ) {
    const existing = await this.findOne(actor.institute_id, id);
    const updated = await this.prisma.admissionFeeStructure.update({
      where: { fee_structure_id: id },
      data: {
        amount:
          dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : undefined,
        due_date: dto.due_date ? new Date(dto.due_date) : undefined,
      },
      include: INCLUDE,
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.FEE_STRUCTURE,
      entityId: String(id),
      action: 'update',
      metadata: {
        amount: {
          from: existing.amount.toString(),
          to: updated.amount.toString(),
        },
      },
    });
    return updated;
  }
}
