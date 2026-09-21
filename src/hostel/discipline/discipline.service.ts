import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAuditService } from '../common/hostel-audit.service';
import { HostelLookupService } from '../common/hostel-lookup.service';
import { HOSTEL_ENTITY } from '../common/hostel-entities';
import { BusinessException } from '../common/business-exception';
import { localToday, parseDateOnly } from '../common/time.util';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
} from '../common/pagination.util';
import {
  CreateDisciplineRecordDto,
  QueryDisciplineDto,
} from './dto/discipline.dto';

const RECORD_INCLUDE = {
  resident: {
    select: { resident_id: true, student_name: true, admission_no: true },
  },
  gate_pass: {
    select: {
      gate_pass_id: true,
      pass_no: true,
      status: true,
      expected_return_at: true,
      actual_return_at: true,
    },
  },
} satisfies Prisma.HostelDisciplineRecordInclude;

/**
 * Discipline records are append-only evidence: they can be created and linked
 * to a gate pass, but not edited or deleted. Nothing here suspends a resident
 * automatically — a `suspension` action is the record of a decision; the
 * suspension itself is done explicitly on the resident.
 */
@Injectable()
export class DisciplineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: HostelLookupService,
    private readonly audit: HostelAuditService,
  ) {}

  /** A linked pass must exist in this institute and belong to the same resident. */
  private async assertPassBelongsTo(
    instituteId: string,
    residentId: number,
    gatePassId: number,
  ) {
    const pass = await this.lookup.gatePass(instituteId, gatePassId);
    if (pass.resident_id !== residentId) {
      throw new BusinessException(
        'GATE_PASS_RESIDENT_MISMATCH',
        'That gate pass belongs to a different resident',
        { gate_pass_id: gatePassId },
      );
    }
    return pass;
  }

  async create(
    actor: HostelPlatformUser,
    residentId: number,
    dto: CreateDisciplineRecordDto,
  ) {
    await this.lookup.resident(actor.institute_id, residentId);
    const incidentDate = parseDateOnly(dto.incident_date, 'incident_date');
    if (incidentDate.getTime() > localToday().getTime()) {
      throw new BusinessException(
        'INVALID_INCIDENT_DATE',
        'incident_date cannot be in the future',
      );
    }
    if (dto.action_taken === 'fine' && dto.fine_amount === undefined) {
      throw new BusinessException(
        'FINE_AMOUNT_REQUIRED',
        'fine_amount is required when the action is a fine',
      );
    }
    if (dto.action_taken !== 'fine' && dto.fine_amount !== undefined) {
      throw new BusinessException(
        'FINE_AMOUNT_NOT_ALLOWED',
        'fine_amount only applies to a fine',
      );
    }
    if (dto.gate_pass_id) {
      await this.assertPassBelongsTo(
        actor.institute_id,
        residentId,
        dto.gate_pass_id,
      );
    }

    const record = await this.prisma.hostelDisciplineRecord.create({
      data: {
        institute_id: actor.institute_id,
        resident_id: residentId,
        incident_date: incidentDate,
        category: dto.category,
        description: dto.description,
        action_taken: dto.action_taken,
        fine_amount:
          dto.fine_amount !== undefined
            ? new Prisma.Decimal(dto.fine_amount)
            : undefined,
        gate_pass_id: dto.gate_pass_id,
        recorded_by: actor.eddva_user_id,
      },
      include: RECORD_INCLUDE,
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.DISCIPLINE,
      entityId: String(record.record_id),
      action: 'create',
      metadata: {
        resident_id: residentId,
        category: record.category,
        action_taken: record.action_taken,
        gate_pass_id: record.gate_pass_id,
      },
    });
    return record;
  }

  async findAll(instituteId: string, query: QueryDisciplineDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const range = buildDateRange(query.from, query.to);
    const where: Prisma.HostelDisciplineRecordWhereInput = {
      institute_id: instituteId,
      resident_id: query.resident_id,
      category: query.category,
      action_taken: query.action_taken,
      gate_pass_id: query.gate_pass_id,
      ...(range ? { incident_date: range } : {}),
      ...(query.search
        ? {
            OR: [
              { description: { contains: query.search, mode: 'insensitive' } },
              {
                resident: {
                  student_name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.hostelDisciplineRecord.findMany({
        where,
        include: RECORD_INCLUDE,
        orderBy: [{ incident_date: 'desc' }, { record_id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.hostelDisciplineRecord.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async residentHistory(
    instituteId: string,
    residentId: number,
    query: QueryDisciplineDto,
  ) {
    await this.lookup.resident(instituteId, residentId);
    return this.findAll(instituteId, { ...query, resident_id: residentId });
  }

  async findOne(instituteId: string, id: number) {
    const record = await this.prisma.hostelDisciplineRecord.findFirst({
      where: { record_id: id, institute_id: instituteId },
      include: RECORD_INCLUDE,
    });
    if (!record)
      throw new NotFoundException(`Discipline record #${id} not found`);
    return record;
  }

  /** Attach (or, if none yet, set) the gate pass an incident relates to — e.g. to trace repeated late returns. */
  async linkGatePass(
    actor: HostelPlatformUser,
    id: number,
    gatePassId: number,
  ) {
    const record = await this.findOne(actor.institute_id, id);
    await this.assertPassBelongsTo(
      actor.institute_id,
      record.resident_id,
      gatePassId,
    );
    const updated = await this.prisma.hostelDisciplineRecord.update({
      where: { record_id: id },
      data: { gate_pass_id: gatePassId },
      include: RECORD_INCLUDE,
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.DISCIPLINE,
      entityId: String(id),
      action: 'link_gate_pass',
      oldStatus: record.gate_pass_id ? String(record.gate_pass_id) : undefined,
      newStatus: String(gatePassId),
    });
    return updated;
  }
}
