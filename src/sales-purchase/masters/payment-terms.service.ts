import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';
import { SP_ENTITY } from '../common/sales-purchase-entities';
import {
  CreatePaymentTermDto,
  UpdatePaymentTermDto,
} from './dto/payment-term.dto';

@Injectable()
export class PaymentTermsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SalesPurchaseAuditService,
  ) {}

  async create(
    instituteId: string,
    dto: CreatePaymentTermDto,
    actorId?: string,
  ) {
    const existing = await this.prisma.spPaymentTerm.findUnique({
      where: {
        institute_id_term_name: {
          institute_id: instituteId,
          term_name: dto.term_name,
        },
      },
    });
    if (existing)
      throw new ConflictException(
        `Payment term "${dto.term_name}" already exists`,
      );

    const term = await this.prisma.spPaymentTerm.create({
      data: {
        institute_id: instituteId,
        term_name: dto.term_name,
        days: dto.days,
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PAYMENT_TERM,
      entityId: String(term.payment_term_id),
      action: 'create',
    });
    return term;
  }

  async findAll(instituteId: string, search?: string) {
    return this.prisma.spPaymentTerm.findMany({
      where: {
        institute_id: instituteId,
        term_name: search
          ? { contains: search, mode: 'insensitive' }
          : undefined,
      },
      orderBy: { days: 'asc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const term = await this.prisma.spPaymentTerm.findFirst({
      where: { payment_term_id: id, institute_id: instituteId },
    });
    if (!term) throw new NotFoundException(`Payment term #${id} not found`);
    return term;
  }

  async update(
    instituteId: string,
    id: number,
    dto: UpdatePaymentTermDto,
    actorId?: string,
  ) {
    await this.findOne(instituteId, id);
    if (dto.term_name) {
      const clash = await this.prisma.spPaymentTerm.findUnique({
        where: {
          institute_id_term_name: {
            institute_id: instituteId,
            term_name: dto.term_name,
          },
        },
      });
      if (clash && clash.payment_term_id !== id)
        throw new ConflictException(
          `Payment term "${dto.term_name}" already exists`,
        );
    }

    const updated = await this.prisma.spPaymentTerm.update({
      where: { payment_term_id: id },
      data: { term_name: dto.term_name, days: dto.days },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PAYMENT_TERM,
      entityId: String(id),
      action: 'update',
    });
    return updated;
  }

  /** Hard delete. Blocked while any vendor or customer still references this payment term. */
  async remove(instituteId: string, id: number, actorId?: string) {
    await this.findOne(instituteId, id);

    const [vendorCount, customerCount] = await Promise.all([
      this.prisma.spVendor.count({ where: { payment_term_id: id } }),
      this.prisma.spCustomer.count({ where: { payment_term_id: id } }),
    ]);
    const usageCount = vendorCount + customerCount;
    if (usageCount > 0) {
      throw new ConflictException(
        `Payment term #${id} is referenced by ${usageCount} vendor(s)/customer(s) and cannot be deleted. Reassign them first.`,
      );
    }

    await this.prisma.spPaymentTerm.delete({ where: { payment_term_id: id } });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PAYMENT_TERM,
      entityId: String(id),
      action: 'delete',
    });
    return { success: true };
  }
}
