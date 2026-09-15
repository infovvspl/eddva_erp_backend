import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import {
  CreateCustomerContactDto,
  UpdateCustomerContactDto,
} from './dto/customer-contact.dto';

const CUSTOMER_SORT_FIELDS = [
  'customer_name',
  'customer_code',
  'created_at',
] as const;

@Injectable()
export class CustomersService {
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

  async create(instituteId: string, dto: CreateCustomerDto, actorId?: string) {
    await this.assertPaymentTermExists(instituteId, dto.payment_term_id);

    const customer_code = await this.numbering.generateNextCode(
      DocumentType.SP_CUSTOMER,
      'CN/',
    );
    const customer = await this.prisma.spCustomer.create({
      data: {
        institute_id: instituteId,
        customer_code,
        customer_name: dto.customer_name,
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
      entityType: SP_ENTITY.CUSTOMER,
      entityId: String(customer.customer_id),
      action: 'create',
    });
    return customer;
  }

  async findAll(instituteId: string, query: QueryCustomerDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = CUSTOMER_SORT_FIELDS.includes(query.sortBy as any)
      ? (query.sortBy as (typeof CUSTOMER_SORT_FIELDS)[number])
      : 'customer_name';
    const sortOrder = parseSortOrder(query.sortOrder);

    const where = {
      institute_id: instituteId,
      deleted_at: null,
      status: query.status,
      OR: query.search
        ? [
            {
              customer_name: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
            {
              customer_code: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
            { gstin: { contains: query.search, mode: 'insensitive' as const } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.spCustomer.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
      }),
      this.prisma.spCustomer.count({ where }),
    ]);

    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const customer = await this.prisma.spCustomer.findFirst({
      where: { customer_id: id, institute_id: instituteId, deleted_at: null },
      include: { contacts: true, payment_term: true },
    });
    if (!customer) throw new NotFoundException(`Customer #${id} not found`);
    return customer;
  }

  async assertActiveCustomer(instituteId: string, id: number) {
    const customer = await this.prisma.spCustomer.findFirst({
      where: { customer_id: id, institute_id: instituteId, deleted_at: null },
    });
    if (!customer) throw new NotFoundException(`Customer #${id} not found`);
    if (customer.status !== SpPartyStatus.ACTIVE) {
      throw new BadRequestException(
        `Customer "${customer.customer_name}" is ${customer.status} and cannot be used for new transactions`,
      );
    }
    return customer;
  }

  async update(
    instituteId: string,
    id: number,
    dto: UpdateCustomerDto,
    actorId?: string,
  ) {
    const existing = await this.prisma.spCustomer.findFirst({
      where: { customer_id: id, institute_id: instituteId, deleted_at: null },
    });
    if (!existing) throw new NotFoundException(`Customer #${id} not found`);
    await this.assertPaymentTermExists(instituteId, dto.payment_term_id);

    const updated = await this.prisma.spCustomer.update({
      where: { customer_id: id },
      data: {
        customer_name: dto.customer_name,
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
      entityType: SP_ENTITY.CUSTOMER,
      entityId: String(id),
      action: 'update',
      oldStatus: existing.status,
      newStatus: updated.status,
    });
    return updated;
  }

  async remove(instituteId: string, id: number, actorId?: string) {
    const existing = await this.prisma.spCustomer.findFirst({
      where: { customer_id: id, institute_id: instituteId, deleted_at: null },
    });
    if (!existing) throw new NotFoundException(`Customer #${id} not found`);

    const updated = await this.prisma.spCustomer.update({
      where: { customer_id: id },
      data: {
        deleted_at: new Date(),
        status: SpPartyStatus.INACTIVE,
        updated_by: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.CUSTOMER,
      entityId: String(id),
      action: 'delete',
    });
    return updated;
  }

  // ─── Contacts ─────────────────────────────────────────────────────────────

  async addContact(
    instituteId: string,
    customerId: number,
    dto: CreateCustomerContactDto,
    actorId?: string,
  ) {
    await this.findOne(instituteId, customerId);
    const contact = await this.prisma.spCustomerContact.create({
      data: { customer_id: customerId, ...dto },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.CUSTOMER_CONTACT,
      entityId: String(contact.contact_id),
      action: 'create',
      metadata: { customer_id: customerId },
    });
    return contact;
  }

  async listContacts(instituteId: string, customerId: number) {
    await this.findOne(instituteId, customerId);
    return this.prisma.spCustomerContact.findMany({
      where: { customer_id: customerId },
      orderBy: { created_at: 'asc' },
    });
  }

  private async assertContactBelongs(customerId: number, contactId: number) {
    const contact = await this.prisma.spCustomerContact.findFirst({
      where: { contact_id: contactId, customer_id: customerId },
    });
    if (!contact)
      throw new NotFoundException(
        `Contact #${contactId} not found for customer #${customerId}`,
      );
    return contact;
  }

  async updateContact(
    instituteId: string,
    customerId: number,
    contactId: number,
    dto: UpdateCustomerContactDto,
    actorId?: string,
  ) {
    await this.findOne(instituteId, customerId);
    await this.assertContactBelongs(customerId, contactId);
    const updated = await this.prisma.spCustomerContact.update({
      where: { contact_id: contactId },
      data: dto,
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.CUSTOMER_CONTACT,
      entityId: String(contactId),
      action: 'update',
      metadata: { customer_id: customerId },
    });
    return updated;
  }

  async removeContact(
    instituteId: string,
    customerId: number,
    contactId: number,
    actorId?: string,
  ) {
    await this.findOne(instituteId, customerId);
    await this.assertContactBelongs(customerId, contactId);
    await this.prisma.spCustomerContact.delete({
      where: { contact_id: contactId },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.CUSTOMER_CONTACT,
      entityId: String(contactId),
      action: 'delete',
      metadata: { customer_id: customerId },
    });
    return { success: true };
  }
}
