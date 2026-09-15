import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';
import { SP_ENTITY } from '../common/sales-purchase-entities';
import { CreateTaxCodeDto } from './dto/tax-code.dto';

/**
 * Tax codes are versioned, never edited in place (module spec §14): a rate
 * change always creates a new row with a later effective_from rather than
 * mutating an existing one, so historical transactions that snapshot their
 * own rates are never affected. This service therefore exposes create/list/
 * get and a narrow is_active toggle — never a general update of rate fields.
 */
@Injectable()
export class TaxCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SalesPurchaseAuditService,
  ) {}

  async create(instituteId: string, dto: CreateTaxCodeDto, actorId?: string) {
    const taxCode = await this.prisma.spTaxCode.create({
      data: {
        institute_id: instituteId,
        name: dto.name,
        cgst_pct: dto.cgst_pct,
        sgst_pct: dto.sgst_pct,
        igst_pct: dto.igst_pct,
        effective_from: new Date(dto.effective_from),
        created_by: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.TAX_CODE,
      entityId: String(taxCode.tax_code_id),
      action: 'create',
    });
    return taxCode;
  }

  async findAll(instituteId: string, search?: string) {
    return this.prisma.spTaxCode.findMany({
      where: {
        institute_id: instituteId,
        name: search ? { contains: search, mode: 'insensitive' } : undefined,
      },
      orderBy: [{ name: 'asc' }, { effective_from: 'desc' }],
    });
  }

  async findOne(instituteId: string, id: number) {
    const taxCode = await this.prisma.spTaxCode.findFirst({
      where: { tax_code_id: id, institute_id: instituteId },
    });
    if (!taxCode) throw new NotFoundException(`Tax code #${id} not found`);
    return taxCode;
  }

  async setActive(
    instituteId: string,
    id: number,
    isActive: boolean,
    actorId?: string,
  ) {
    const existing = await this.findOne(instituteId, id);
    const updated = await this.prisma.spTaxCode.update({
      where: { tax_code_id: id },
      data: { is_active: isActive },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.TAX_CODE,
      entityId: String(id),
      action: 'update',
      oldStatus: existing.is_active ? 'ACTIVE' : 'INACTIVE',
      newStatus: updated.is_active ? 'ACTIVE' : 'INACTIVE',
    });
    return updated;
  }

  /**
   * Hard delete. Only removable while completely unused — referenced by an
   * item's default tax code, or by a PO/SO line — since those are
   * non-nullable-in-spirit FKs a live document depends on. Posted invoice
   * lines are never affected either way: they snapshot cgst/sgst/igst as
   * plain numbers with no FK back to sp_tax_codes (module spec §14/§59).
   */
  async remove(instituteId: string, id: number, actorId?: string) {
    await this.findOne(instituteId, id);

    const [itemCount, poItemCount, soItemCount] = await Promise.all([
      this.prisma.spItem.count({ where: { tax_code_id: id } }),
      this.prisma.spPurchaseOrderItem.count({ where: { tax_code_id: id } }),
      this.prisma.spSalesOrderItem.count({ where: { tax_code_id: id } }),
    ]);
    const usageCount = itemCount + poItemCount + soItemCount;
    if (usageCount > 0) {
      throw new ConflictException(
        `Tax code #${id} is referenced by ${usageCount} item/order line(s) and cannot be deleted. Retire it via the "active" toggle instead.`,
      );
    }

    await this.prisma.spTaxCode.delete({ where: { tax_code_id: id } });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.TAX_CODE,
      entityId: String(id),
      action: 'delete',
    });
    return { success: true };
  }
}
