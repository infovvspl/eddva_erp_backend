import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialYearStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsAuditService } from '../common/accounts-audit.service';
import { ACCOUNTS_ENTITY } from '../common/accounts-entities';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { CreateFinancialYearDto } from './dto/create-financial-year.dto';

@Injectable()
export class FinancialYearsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AccountsAuditService,
  ) {}

  async create(dto: CreateFinancialYearDto, actor: AccountsPlatformUser) {
    const { eddva_user_id: userId, institute_id: instituteId } = actor;
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) throw new BadRequestException('endDate must be after startDate');

    const existingLabel = await this.prisma.financialYear.findFirst({ where: { fyLabel: dto.fyLabel, instituteId } });
    if (existingLabel) throw new ConflictException(`Financial year "${dto.fyLabel}" already exists`);

    const overlapping = await this.prisma.financialYear.findFirst({
      where: { instituteId, startDate: { lte: endDate }, endDate: { gte: startDate } },
    });
    if (overlapping) {
      throw new ConflictException(`Date range overlaps with existing financial year "${overlapping.fyLabel}"`);
    }

    const fy = await this.prisma.financialYear.create({
      data: { fyLabel: dto.fyLabel, startDate, endDate, instituteId },
    });
    await this.auditService.log({ userId, entityType: ACCOUNTS_ENTITY.FINANCIAL_YEAR, entityId: fy.id, action: 'CREATE' });
    return fy;
  }

  async findAll(actor: AccountsPlatformUser) {
    return this.prisma.financialYear.findMany({ where: { instituteId: actor.institute_id }, orderBy: { startDate: 'desc' } });
  }

  async findOne(id: string, actor: AccountsPlatformUser) {
    const fy = await this.prisma.financialYear.findFirst({ where: { id, instituteId: actor.institute_id } });
    if (!fy) throw new NotFoundException(`Financial year ${id} not found`);
    return fy;
  }

  /** Rule 6: voucher dates must fall within the financial year they're posted against. Rule 4: the FY must be open. */
  async assertOpenAndDateInRange(fy: { id: string; status: FinancialYearStatus; startDate: Date; endDate: Date; fyLabel: string }, voucherDate: Date) {
    if (fy.status !== FinancialYearStatus.OPEN) {
      throw new BadRequestException(`Financial year "${fy.fyLabel}" is closed — no new or edited vouchers are allowed`);
    }
    if (voucherDate < fy.startDate || voucherDate > fy.endDate) {
      throw new BadRequestException(`Voucher date must fall between ${fy.startDate.toISOString().slice(0, 10)} and ${fy.endDate.toISOString().slice(0, 10)} for financial year "${fy.fyLabel}"`);
    }
  }
}
