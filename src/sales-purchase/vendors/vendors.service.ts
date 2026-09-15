import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType, SpPartyStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../numbering/numbering.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';
import { SP_ENTITY } from '../common/sales-purchase-entities';
import {
  buildMeta,
  parsePagination,
  parseSortOrder,
} from '../common/pagination.util';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { QueryVendorDto } from './dto/query-vendor.dto';
import {
  CreateVendorContactDto,
  UpdateVendorContactDto,
} from './dto/vendor-contact.dto';
import {
  CreateVendorBankDetailDto,
  UpdateVendorBankDetailDto,
} from './dto/vendor-bank-detail.dto';

/** Never expose a full bank account number in an API response or a log line. */
export function maskAccountNo(accountNo: string): string {
  if (accountNo.length <= 4) return '••••';
  return `••••${accountNo.slice(-4)}`;
}

const VENDOR_SORT_FIELDS = [
  'vendor_name',
  'vendor_code',
  'created_at',
] as const;

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: SalesPurchaseAuditService,
  ) {}

  private async assertPaymentTermExists(
    instituteId: string,
    paymentTermId?: number,
  ) {
    if (!paymentTermId) return;
    const term = await this.prisma.spPaymentTerm.findFirst({
      where: { payment_term_id: paymentTermId, institute_id: instituteId },
    });
    if (!term)
      throw new NotFoundException(`Payment term #${paymentTermId} not found`);
  }

  async create(instituteId: string, dto: CreateVendorDto, actorId?: string) {
    await this.assertPaymentTermExists(instituteId, dto.payment_term_id);

    const vendor_code = await this.numbering.generateNextCode(
      DocumentType.SP_VENDOR,
      'VN/',
    );
    const vendor = await this.prisma.spVendor.create({
      data: {
        institute_id: instituteId,
        vendor_code,
        vendor_name: dto.vendor_name,
        gstin: dto.gstin,
        tax_id: dto.tax_id,
        address_line1: dto.address_line1,
        address_line2: dto.address_line2,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        payment_term_id: dto.payment_term_id,
        credit_limit: dto.credit_limit ?? 0,
        created_by: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.VENDOR,
      entityId: String(vendor.vendor_id),
      action: 'create',
    });
    return vendor;
  }

  async findAll(instituteId: string, query: QueryVendorDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = VENDOR_SORT_FIELDS.includes(query.sortBy as any)
      ? (query.sortBy as (typeof VENDOR_SORT_FIELDS)[number])
      : 'vendor_name';
    const sortOrder = parseSortOrder(query.sortOrder);

    const where = {
      institute_id: instituteId,
      deleted_at: null,
      status: query.status,
      OR: query.search
        ? [
            {
              vendor_name: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
            {
              vendor_code: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
            { gstin: { contains: query.search, mode: 'insensitive' as const } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.spVendor.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
      }),
      this.prisma.spVendor.count({ where }),
    ]);

    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const vendor = await this.prisma.spVendor.findFirst({
      where: { vendor_id: id, institute_id: instituteId, deleted_at: null },
      include: {
        contacts: true,
        bank_details: true,
        payment_term: true,
      },
    });
    if (!vendor) throw new NotFoundException(`Vendor #${id} not found`);
    return {
      ...vendor,
      bank_details: vendor.bank_details.map((b) => ({
        ...b,
        account_no: maskAccountNo(b.account_no),
      })),
    };
  }

  async assertActiveVendor(instituteId: string, id: number) {
    const vendor = await this.prisma.spVendor.findFirst({
      where: { vendor_id: id, institute_id: instituteId, deleted_at: null },
    });
    if (!vendor) throw new NotFoundException(`Vendor #${id} not found`);
    if (vendor.status !== SpPartyStatus.ACTIVE) {
      throw new BadRequestException(
        `Vendor "${vendor.vendor_name}" is ${vendor.status} and cannot be used for new transactions`,
      );
    }
    return vendor;
  }

  async update(
    instituteId: string,
    id: number,
    dto: UpdateVendorDto,
    actorId?: string,
  ) {
    const existing = await this.prisma.spVendor.findFirst({
      where: { vendor_id: id, institute_id: instituteId, deleted_at: null },
    });
    if (!existing) throw new NotFoundException(`Vendor #${id} not found`);
    await this.assertPaymentTermExists(instituteId, dto.payment_term_id);

    const updated = await this.prisma.spVendor.update({
      where: { vendor_id: id },
      data: {
        vendor_name: dto.vendor_name,
        gstin: dto.gstin,
        tax_id: dto.tax_id,
        address_line1: dto.address_line1,
        address_line2: dto.address_line2,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        payment_term_id: dto.payment_term_id,
        credit_limit: dto.credit_limit,
        status: dto.status,
        updated_by: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.VENDOR,
      entityId: String(id),
      action: 'update',
      oldStatus: existing.status,
      newStatus: updated.status,
    });
    return updated;
  }

  async remove(instituteId: string, id: number, actorId?: string) {
    const existing = await this.prisma.spVendor.findFirst({
      where: { vendor_id: id, institute_id: instituteId, deleted_at: null },
    });
    if (!existing) throw new NotFoundException(`Vendor #${id} not found`);

    const updated = await this.prisma.spVendor.update({
      where: { vendor_id: id },
      data: {
        deleted_at: new Date(),
        status: SpPartyStatus.INACTIVE,
        updated_by: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.VENDOR,
      entityId: String(id),
      action: 'delete',
    });
    return updated;
  }

  // ─── Contacts ─────────────────────────────────────────────────────────────

  async addContact(
    instituteId: string,
    vendorId: number,
    dto: CreateVendorContactDto,
    actorId?: string,
  ) {
    await this.findOne(instituteId, vendorId);
    const contact = await this.prisma.spVendorContact.create({
      data: { vendor_id: vendorId, ...dto },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.VENDOR_CONTACT,
      entityId: String(contact.contact_id),
      action: 'create',
      metadata: { vendor_id: vendorId },
    });
    return contact;
  }

  async listContacts(instituteId: string, vendorId: number) {
    await this.findOne(instituteId, vendorId);
    return this.prisma.spVendorContact.findMany({
      where: { vendor_id: vendorId },
      orderBy: { created_at: 'asc' },
    });
  }

  private async assertContactBelongs(vendorId: number, contactId: number) {
    const contact = await this.prisma.spVendorContact.findFirst({
      where: { contact_id: contactId, vendor_id: vendorId },
    });
    if (!contact)
      throw new NotFoundException(
        `Contact #${contactId} not found for vendor #${vendorId}`,
      );
    return contact;
  }

  async updateContact(
    instituteId: string,
    vendorId: number,
    contactId: number,
    dto: UpdateVendorContactDto,
    actorId?: string,
  ) {
    await this.findOne(instituteId, vendorId);
    await this.assertContactBelongs(vendorId, contactId);
    const updated = await this.prisma.spVendorContact.update({
      where: { contact_id: contactId },
      data: dto,
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.VENDOR_CONTACT,
      entityId: String(contactId),
      action: 'update',
      metadata: { vendor_id: vendorId },
    });
    return updated;
  }

  async removeContact(
    instituteId: string,
    vendorId: number,
    contactId: number,
    actorId?: string,
  ) {
    await this.findOne(instituteId, vendorId);
    await this.assertContactBelongs(vendorId, contactId);
    await this.prisma.spVendorContact.delete({
      where: { contact_id: contactId },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.VENDOR_CONTACT,
      entityId: String(contactId),
      action: 'delete',
      metadata: { vendor_id: vendorId },
    });
    return { success: true };
  }

  // ─── Bank Details ───────────────────────────────────────────────────────────

  async addBankDetail(
    instituteId: string,
    vendorId: number,
    dto: CreateVendorBankDetailDto,
    actorId?: string,
  ) {
    await this.findOne(instituteId, vendorId);

    const bank = await this.prisma.$transaction(async (tx) => {
      if (dto.is_primary) {
        await tx.spVendorBankDetail.updateMany({
          where: { vendor_id: vendorId, is_primary: true },
          data: { is_primary: false },
        });
      }
      return tx.spVendorBankDetail.create({
        data: {
          vendor_id: vendorId,
          ...dto,
          is_primary: dto.is_primary ?? false,
        },
      });
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.VENDOR_BANK_DETAIL,
      entityId: String(bank.bank_id),
      action: 'create',
      metadata: { vendor_id: vendorId },
    });
    return { ...bank, account_no: maskAccountNo(bank.account_no) };
  }

  async listBankDetails(instituteId: string, vendorId: number) {
    await this.findOne(instituteId, vendorId);
    const list = await this.prisma.spVendorBankDetail.findMany({
      where: { vendor_id: vendorId },
      orderBy: { is_primary: 'desc' },
    });
    return list.map((b) => ({ ...b, account_no: maskAccountNo(b.account_no) }));
  }

  private async assertBankBelongs(vendorId: number, bankId: number) {
    const bank = await this.prisma.spVendorBankDetail.findFirst({
      where: { bank_id: bankId, vendor_id: vendorId },
    });
    if (!bank)
      throw new NotFoundException(
        `Bank detail #${bankId} not found for vendor #${vendorId}`,
      );
    return bank;
  }

  async updateBankDetail(
    instituteId: string,
    vendorId: number,
    bankId: number,
    dto: UpdateVendorBankDetailDto,
    actorId?: string,
  ) {
    await this.findOne(instituteId, vendorId);
    await this.assertBankBelongs(vendorId, bankId);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.is_primary) {
        await tx.spVendorBankDetail.updateMany({
          where: {
            vendor_id: vendorId,
            is_primary: true,
            bank_id: { not: bankId },
          },
          data: { is_primary: false },
        });
      }
      return tx.spVendorBankDetail.update({
        where: { bank_id: bankId },
        data: dto,
      });
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.VENDOR_BANK_DETAIL,
      entityId: String(bankId),
      action: 'update',
      metadata: { vendor_id: vendorId },
    });
    return { ...updated, account_no: maskAccountNo(updated.account_no) };
  }

  async removeBankDetail(
    instituteId: string,
    vendorId: number,
    bankId: number,
    actorId?: string,
  ) {
    await this.findOne(instituteId, vendorId);
    await this.assertBankBelongs(vendorId, bankId);
    await this.prisma.spVendorBankDetail.delete({ where: { bank_id: bankId } });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.VENDOR_BANK_DETAIL,
      entityId: String(bankId),
      action: 'delete',
      metadata: { vendor_id: vendorId },
    });
    return { success: true };
  }
}
