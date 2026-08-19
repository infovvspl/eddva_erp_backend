import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { extractUserContext, scopeWhere } from '../common/utils/institute-scope.util';
import {
  CreateVendorDto,
  UpdateVendorDto,
  CreateVendorContactDto,
  UpdateVendorContactDto,
  CreateVendorBankDetailDto,
  UpdateVendorBankDetailDto,
} from './dto/vendor.dto';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  CreateCustomerContactDto,
  UpdateCustomerContactDto,
} from './dto/customer.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class PartiesService {
  constructor(private prisma: PrismaService) {}

  // --- Vendor Management ---
  private async generateVendorCode(): Promise<string> {
    const count = await this.prisma.vendor.count();
    const nextNum = count + 1;
    return `VEND-${String(nextNum).padStart(5, '0')}`;
  }

  async createVendor(dto: CreateVendorDto, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const vendorCode = await this.generateVendorCode();
    const { contacts, bankDetails, ...vendorData } = dto;

    return this.prisma.vendor.create({
      data: {
        ...vendorData,
        instituteId,
        vendorCode,
        contacts: contacts && contacts.length > 0 ? { createMany: { data: contacts } } : undefined,
        bankDetails: bankDetails && bankDetails.length > 0 ? { createMany: { data: bankDetails } } : undefined,
      },
      include: {
        paymentTerm: true,
        contacts: true,
        bankDetails: true,
      },
    });
  }

  async getVendors(query: PaginationQueryDto & { status?: string }, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const { page = 1, limit = 25, search, status } = query;
    const skip = (page - 1) * limit;

    let where: any = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { vendorCode: { contains: search, mode: 'insensitive' } },
        { vendorName: { contains: search, mode: 'insensitive' } },
        { gstin: { contains: search, mode: 'insensitive' } },
      ];
    }
    where = scopeWhere(where, instituteId);

    const [vendors, total] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { vendorCode: 'asc' },
        select: {
          id: true,
          vendorCode: true,
          vendorName: true,
          city: true,
          state: true,
          gstin: true,
          status: true,
          paymentTerm: { select: { id: true, termName: true, days: true } },
          _count: { select: { contacts: true, bankDetails: true } },
        },
      }),
      this.prisma.vendor.count({ where }),
    ]);

    return {
      data: vendors,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getVendorById(id: string, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const where = scopeWhere({ id }, instituteId);
    const vendor = await this.prisma.vendor.findFirst({
      where,
      select: {
        id: true,
        vendorCode: true,
        vendorName: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        pincode: true,
        gstin: true,
        taxId: true,
        creditLimit: true,
        paymentTermId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        paymentTerm: { select: { id: true, termName: true, days: true } },
        contacts: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            designation: true,
          },
        },
        bankDetails: {
          select: {
            id: true,
            bankName: true,
            accountNo: true,
            ifsc: true,
            swift: true,
            isPrimary: true,
          },
        },
      },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found.');
    }
    return vendor;
  }

  async updateVendor(id: string, dto: UpdateVendorDto, userParam?: any) {
    await this.getVendorById(id, userParam);
    const { contacts, bankDetails, ...vendorData } = dto;

    return this.prisma.vendor.update({
      where: { id },
      data: vendorData,
      include: { paymentTerm: true, contacts: true, bankDetails: true },
    });
  }

  async deleteVendor(id: string, userParam?: any) {
    const vendor = await this.getVendorById(id, userParam);
    const [poCount, grnCount, piCount] = await Promise.all([
      this.prisma.purchaseOrder.count({ where: { vendorId: id } }),
      this.prisma.goodsReceiptNote.count({ where: { vendorId: id } }),
      this.prisma.purchaseInvoice.count({ where: { vendorId: id } }),
    ]);

    if (poCount > 0 || grnCount > 0 || piCount > 0) {
      await this.prisma.vendor.update({
        where: { id },
        data: { status: 'INACTIVE' },
      });
      return { message: `Vendor ${vendor.vendorName} is linked to active transactions. Status set to INACTIVE.` };
    }

    await this.prisma.vendor.delete({ where: { id } });
    return { message: `Vendor ${vendor.vendorName} deleted successfully.` };
  }

  // --- Vendor Sub-Resources (Contacts & Bank Details) ---
  async getVendorContacts(vendorId: string, userParam?: any) {
    const vendor = await this.getVendorById(vendorId, userParam);
    return vendor.contacts;
  }

  async addVendorContact(vendorId: string, dto: CreateVendorContactDto, userParam?: any) {
    await this.getVendorById(vendorId, userParam);
    return this.prisma.vendorContact.create({
      data: {
        ...dto,
        vendorId,
      },
    });
  }

  async updateVendorContact(vendorId: string, contactId: string, dto: UpdateVendorContactDto, userParam?: any) {
    await this.getVendorById(vendorId, userParam);
    const contact = await this.prisma.vendorContact.findFirst({
      where: { id: contactId, vendorId },
    });
    if (!contact) {
      throw new NotFoundException('Vendor contact not found.');
    }
    return this.prisma.vendorContact.update({
      where: { id: contactId },
      data: dto,
    });
  }

  async deleteVendorContact(vendorId: string, contactId: string, userParam?: any) {
    await this.getVendorById(vendorId, userParam);
    const contact = await this.prisma.vendorContact.findFirst({
      where: { id: contactId, vendorId },
    });
    if (!contact) {
      throw new NotFoundException('Vendor contact not found.');
    }
    await this.prisma.vendorContact.delete({ where: { id: contactId } });
    return { message: 'Vendor contact deleted successfully.' };
  }

  async getVendorBankDetails(vendorId: string, userParam?: any) {
    const vendor = await this.getVendorById(vendorId, userParam);
    return vendor.bankDetails;
  }

  async addVendorBankDetail(vendorId: string, dto: CreateVendorBankDetailDto, userParam?: any) {
    await this.getVendorById(vendorId, userParam);
    if (dto.isPrimary) {
      await this.prisma.vendorBankDetail.updateMany({
        where: { vendorId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return this.prisma.vendorBankDetail.create({
      data: {
        ...dto,
        vendorId,
      },
    });
  }

  async updateVendorBankDetail(vendorId: string, bankId: string, dto: UpdateVendorBankDetailDto, userParam?: any) {
    await this.getVendorById(vendorId, userParam);
    const bank = await this.prisma.vendorBankDetail.findFirst({
      where: { id: bankId, vendorId },
    });
    if (!bank) {
      throw new NotFoundException('Vendor bank detail not found.');
    }
    if (dto.isPrimary) {
      await this.prisma.vendorBankDetail.updateMany({
        where: { vendorId, isPrimary: true, NOT: { id: bankId } },
        data: { isPrimary: false },
      });
    }
    return this.prisma.vendorBankDetail.update({
      where: { id: bankId },
      data: dto,
    });
  }

  async deleteVendorBankDetail(vendorId: string, bankId: string, userParam?: any) {
    await this.getVendorById(vendorId, userParam);
    const bank = await this.prisma.vendorBankDetail.findFirst({
      where: { id: bankId, vendorId },
    });
    if (!bank) {
      throw new NotFoundException('Vendor bank detail not found.');
    }
    await this.prisma.vendorBankDetail.delete({ where: { id: bankId } });
    return { message: 'Vendor bank detail deleted successfully.' };
  }

  // --- Customer Management ---
  private async generateCustomerCode(): Promise<string> {
    const count = await this.prisma.customer.count();
    const nextNum = count + 1;
    return `CUST-${String(nextNum).padStart(5, '0')}`;
  }

  async createCustomer(dto: CreateCustomerDto, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const customerCode = await this.generateCustomerCode();
    const { contacts, ...customerData } = dto;

    return this.prisma.customer.create({
      data: {
        ...customerData,
        instituteId,
        customerCode,
        contacts: contacts && contacts.length > 0 ? { createMany: { data: contacts } } : undefined,
      },
      include: {
        paymentTerm: true,
        contacts: true,
      },
    });
  }

  async getCustomers(query: PaginationQueryDto & { status?: string }, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const { page = 1, limit = 25, search, status } = query;
    const skip = (page - 1) * limit;

    let where: any = {};
    if (status) {
      where.status = status as any;
    }
    if (search) {
      where.OR = [
        { customerCode: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { gstin: { contains: search, mode: 'insensitive' } },
      ];
    }
    where = scopeWhere(where, instituteId);

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { customerCode: 'asc' },
        select: {
          id: true,
          customerCode: true,
          customerName: true,
          city: true,
          state: true,
          gstin: true,
          status: true,
          paymentTerm: { select: { id: true, termName: true, days: true } },
          _count: { select: { contacts: true } },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: customers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getCustomerById(id: string, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const where = scopeWhere({ id }, instituteId);
    const customer = await this.prisma.customer.findFirst({
      where,
      select: {
        id: true,
        customerCode: true,
        customerName: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        pincode: true,
        gstin: true,
        creditLimit: true,
        paymentTermId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        paymentTerm: { select: { id: true, termName: true, days: true } },
        contacts: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            designation: true,
          },
        },
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }
    return customer;
  }

  async updateCustomer(id: string, dto: UpdateCustomerDto, userParam?: any) {
    await this.getCustomerById(id, userParam);
    const { contacts, ...customerData } = dto;

    return this.prisma.customer.update({
      where: { id },
      data: customerData,
      include: { paymentTerm: true, contacts: true },
    });
  }

  async deleteCustomer(id: string, userParam?: any) {
    const customer = await this.getCustomerById(id, userParam);
    const [soCount, siCount] = await Promise.all([
      this.prisma.salesOrder.count({ where: { customerId: id } }),
      this.prisma.salesInvoice.count({ where: { customerId: id } }),
    ]);

    if (soCount > 0 || siCount > 0) {
      await this.prisma.customer.update({
        where: { id },
        data: { status: 'INACTIVE' },
      });
      return { message: `Customer ${customer.customerName} is linked to active transactions. Status set to INACTIVE.` };
    }

    await this.prisma.customer.delete({ where: { id } });
    return { message: `Customer ${customer.customerName} deleted successfully.` };
  }

  // --- Customer Sub-Resources (Contacts) ---
  async getCustomerContacts(customerId: string, userParam?: any) {
    const customer = await this.getCustomerById(customerId, userParam);
    return customer.contacts;
  }

  async addCustomerContact(customerId: string, dto: CreateCustomerContactDto, userParam?: any) {
    await this.getCustomerById(customerId, userParam);
    return this.prisma.customerContact.create({
      data: {
        ...dto,
        customerId,
      },
    });
  }

  async updateCustomerContact(customerId: string, contactId: string, dto: UpdateCustomerContactDto, userParam?: any) {
    await this.getCustomerById(customerId, userParam);
    const contact = await this.prisma.customerContact.findFirst({
      where: { id: contactId, customerId },
    });
    if (!contact) {
      throw new NotFoundException('Customer contact not found.');
    }
    return this.prisma.customerContact.update({
      where: { id: contactId },
      data: dto,
    });
  }

  async deleteCustomerContact(customerId: string, contactId: string, userParam?: any) {
    await this.getCustomerById(customerId, userParam);
    const contact = await this.prisma.customerContact.findFirst({
      where: { id: contactId, customerId },
    });
    if (!contact) {
      throw new NotFoundException('Customer contact not found.');
    }
    await this.prisma.customerContact.delete({ where: { id: contactId } });
    return { message: 'Customer contact deleted successfully.' };
  }
}
