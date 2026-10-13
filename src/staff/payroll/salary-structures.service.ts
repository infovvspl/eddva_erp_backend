import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { StaffAuditService } from '../common/staff-audit.service';
import { STAFF_ENTITY } from '../common/staff-entities';
import { StaffPlatformUser } from '../auth/staff-auth.service';
import { CreateSalaryStructureDto } from './dto/create-salary-structure.dto';

/** One day before the given date, at UTC midnight. */
function dayBefore(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

@Injectable()
export class SalaryStructuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: StaffAuditService,
  ) {}

  /**
   * Salary history is append-only: a new structure never edits an old one,
   * it closes the previously open-ended structure (`effective_to = null`)
   * the day before the new one starts, so a payroll run can always
   * reconstruct what was actually in force for any given month.
   */
  async create(actor: StaffPlatformUser, dto: CreateSalaryStructureDto) {
    const institute_id = requireInstituteId(actor.institute_id);
    const staff = await this.prisma.staffMember.findFirst({
      where: { staff_id: dto.staff_id, institute_id },
    });
    if (!staff) throw new NotFoundException(`Staff member #${dto.staff_id} not found`);

    const effective_from = new Date(dto.effective_from);

    const openStructure = await this.prisma.staffSalaryStructure.findFirst({
      where: { staff_id: dto.staff_id, effective_to: null },
    });
    if (openStructure) {
      if (openStructure.effective_from >= effective_from) {
        throw new BadRequestException(
          `effective_from must be after the current structure's effective_from (${openStructure.effective_from.toISOString().slice(0, 10)})`,
        );
      }
      await this.prisma.staffSalaryStructure.update({
        where: { structure_id: openStructure.structure_id },
        data: { effective_to: dayBefore(effective_from) },
      });
    }

    const created = await this.prisma.staffSalaryStructure.create({
      data: {
        institute_id,
        staff_id: dto.staff_id,
        basic_salary: dto.basic_salary,
        allowances: dto.allowances ?? {},
        deductions: dto.deductions ?? {},
        effective_from,
        created_by: actor.eddva_user_id,
      },
    });

    await this.audit.log(actor, {
      entityType: STAFF_ENTITY.SALARY_STRUCTURE,
      entityId: String(created.structure_id),
      action: 'create',
    });
    return created;
  }

  async findForStaff(instituteId: string, staffId: number) {
    const institute_id = requireInstituteId(instituteId);
    const staff = await this.prisma.staffMember.findFirst({ where: { staff_id: staffId, institute_id } });
    if (!staff) throw new NotFoundException(`Staff member #${staffId} not found`);

    return this.prisma.staffSalaryStructure.findMany({
      where: { staff_id: staffId, institute_id },
      orderBy: { effective_from: 'desc' },
    });
  }

  /** The structure in force on a given date (defaults to today). */
  async getCurrent(instituteId: string, staffId: number, asOf: Date = new Date()) {
    const institute_id = requireInstituteId(instituteId);
    return this.prisma.staffSalaryStructure.findFirst({
      where: {
        institute_id,
        staff_id: staffId,
        effective_from: { lte: asOf },
        OR: [{ effective_to: null }, { effective_to: { gte: asOf } }],
      },
      orderBy: { effective_from: 'desc' },
    });
  }
}
