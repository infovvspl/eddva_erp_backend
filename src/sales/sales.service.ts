import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DocumentType,
  SoStatus,
  InvoiceStatus,
  PaymentStatus,
  InventoryTransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NumberingService } from '../numbering/numbering.service';
import { AuditService } from '../audit/audit.service';
import { calculateLineTax } from '../common/utils/tax-calculator';
import { extractUserContext, scopeWhere } from '../common/utils/institute-scope.util';
import {
  CreateSalesOrderDto,
  UpdateSalesOrderDto,
} from './dto/sales-order.dto';
import {
  CreateSalesInvoiceDto,
  UpdateSalesInvoiceDto,
  CreateSalesReceiptDto,
  UpdateSalesReceiptDto,
} from './dto/sales-invoice.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private numberingService: NumberingService,
    private auditService: AuditService,
  ) {}

  // ==========================================
  // 1. SALES ORDER MANAGEMENT
  // ==========================================

  async createSo(dto: CreateSalesOrderDto, userParam: any) {
    const { userId, instituteId } = extractUserContext(userParam);
    const customer = await this.prisma.customer.findFirst({
      where: scopeWhere({ id: dto.customerId }, instituteId),
    });
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    const soNumber = await this.numberingService.generateNextNumber(DocumentType.SALES_ORDER);
    const discount = dto.discount || 0;

    let subtotal = 0;
    let taxAmount = 0;

    const itemsData: any[] = [];
    for (const itemDto of dto.items) {
      const taxCode = await this.prisma.taxCode.findUnique({
        where: { id: itemDto.taxCodeId },
      });
      if (!taxCode) {
        throw new NotFoundException(`Tax code ${itemDto.taxCodeId} not found.`);
      }

      const calc = calculateLineTax(
        itemDto.quantity,
        itemDto.unitPrice,
        0,
        Number(taxCode.cgstPct),
        Number(taxCode.sgstPct),
        Number(taxCode.igstPct),
      );

      subtotal += calc.subtotal;
      taxAmount += calc.totalTax;

      itemsData.push({
        itemId: itemDto.itemId,
        quantity: itemDto.quantity,
        unitPrice: itemDto.unitPrice,
        taxCodeId: itemDto.taxCodeId,
        lineTotal: calc.lineTotal,
      });
    }

    const grandTotal = Number((subtotal + taxAmount - discount).toFixed(2));

    const so = await this.prisma.salesOrder.create({
      data: {
        soNumber,
        instituteId,
        customerId: dto.customerId,
        soDate: new Date(dto.soDate),
        deliveryDate: new Date(dto.deliveryDate),
        discount,
        subtotal,
        taxAmount,
        grandTotal,
        status: SoStatus.DRAFT,
        createdBy: userId!,
        items: {
          createMany: {
            data: itemsData,
          },
        },
      },
      include: {
        customer: true,
        items: { include: { item: true, taxCode: true } },
      },
    });

    await this.auditService.log({
      userId,
      entityType: 'SALES_ORDER',
      entityId: so.id,
      action: 'CREATE',
      newStatus: SoStatus.DRAFT,
      metadata: { soNumber, instituteId },
    });

    return so;
  }

  async getSos(query: PaginationQueryDto & { customerId?: string; status?: SoStatus }, userParam?: any) {
    const { userId, instituteId } = extractUserContext(userParam);
    const { page = 1, limit = 25, search, customerId, status } = query;
    const skip = (page - 1) * limit;

    let where: any = {};
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { soNumber: { contains: search, mode: 'insensitive' } },
        { customer: { customerName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    where = scopeWhere(where, instituteId);

    const [sos, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: true,
          creator: { select: { id: true, name: true, email: true } },
          items: { include: { item: true, taxCode: true } },
        },
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    return {
      data: sos,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getSoById(id: string, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const where = scopeWhere({ id }, instituteId);
    const so = await this.prisma.salesOrder.findFirst({
      where,
      include: {
        customer: true,
        creator: { select: { id: true, name: true, email: true } },
        items: { include: { item: true, taxCode: true } },
        salesInvoices: true,
      },
    });
    if (!so) {
      throw new NotFoundException('Sales order not found.');
    }
    return so;
  }

  async confirmSo(id: string, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const so = await this.getSoById(id, userParam);
    if (so.status !== SoStatus.DRAFT) {
      throw new BadRequestException(`Cannot confirm Sales Order in status ${so.status}. Must be DRAFT.`);
    }

    const updatedSo = await this.prisma.salesOrder.update({
      where: { id },
      data: { status: SoStatus.CONFIRMED },
    });

    await this.auditService.log({
      userId,
      entityType: 'SALES_ORDER',
      entityId: id,
      action: 'CONFIRM',
      oldStatus: SoStatus.DRAFT,
      newStatus: SoStatus.CONFIRMED,
    });

    return updatedSo;
  }

  async cancelSo(id: string, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const so = await this.getSoById(id, userParam);
    if (so.status === SoStatus.CANCELLED || so.status === SoStatus.INVOICED) {
      throw new BadRequestException(`Cannot cancel Sales Order in status ${so.status}.`);
    }

    const updatedSo = await this.prisma.salesOrder.update({
      where: { id },
      data: { status: SoStatus.CANCELLED },
    });

    await this.auditService.log({
      userId,
      entityType: 'SALES_ORDER',
      entityId: id,
      action: 'CANCEL',
      oldStatus: so.status,
      newStatus: SoStatus.CANCELLED,
    });

    return updatedSo;
  }

  // ==========================================
  // 2. SALES INVOICES
  // ==========================================

  async createSalesInvoice(dto: CreateSalesInvoiceDto, userParam: any) {
    const { userId, instituteId } = extractUserContext(userParam);
    let customerId = dto.customerId;
    let soNumber: string | null = null;
    let itemsInput = dto.items;

    if (dto.soId) {
      const so = await this.getSoById(dto.soId, userParam);
      if (so.status !== SoStatus.CONFIRMED && so.status !== SoStatus.PARTIALLY_INVOICED) {
        throw new BadRequestException(`Cannot create invoice from SO in status ${so.status}. Must be CONFIRMED or PARTIALLY_INVOICED.`);
      }
      customerId = so.customer.id;
      soNumber = so.soNumber;
      if (!itemsInput || itemsInput.length === 0) {
        itemsInput = so.items.map((soItem) => ({
          itemId: soItem.itemId,
          quantity: Number(soItem.quantity) - Number(soItem.invoicedQty || 0),
          unitPrice: Number(soItem.unitPrice),
          taxCodeId: soItem.taxCodeId,
        })).filter((item) => item.quantity > 0);
      }
    }

    if (!customerId) {
      throw new BadRequestException('Customer is required for creating a Sales Invoice.');
    }
    if (!itemsInput || itemsInput.length === 0) {
      throw new BadRequestException('At least one item line is required for creating a Sales Invoice.');
    }

    const invoiceNumber = await this.numberingService.generateNextNumber(DocumentType.SALES_INVOICE);
    const invoiceDate = dto.invoiceDate ? new Date(dto.invoiceDate) : new Date();
    const dueDate = new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    let subtotal = 0;
    let taxAmount = 0;
    const itemsData: any[] = [];

    for (const itemDto of itemsInput) {
      const taxCode = await this.prisma.taxCode.findUnique({ where: { id: itemDto.taxCodeId } });
      if (!taxCode) throw new NotFoundException(`Tax code ${itemDto.taxCodeId} not found.`);

      const calc = calculateLineTax(
        itemDto.quantity,
        itemDto.unitPrice,
        0,
        Number(taxCode.cgstPct),
        Number(taxCode.sgstPct),
        Number(taxCode.igstPct),
      );

      subtotal += calc.subtotal;
      taxAmount += calc.totalTax;

      itemsData.push({
        itemId: itemDto.itemId,
        quantity: itemDto.quantity,
        unitPrice: itemDto.unitPrice,
        taxCodeId: itemDto.taxCodeId,
        cgstAmount: calc.cgstAmount,
        sgstAmount: calc.sgstAmount,
        igstAmount: calc.igstAmount,
        lineTotal: calc.lineTotal,
      });
    }

    const discount = dto.discount || 0;
    const grandTotal = Number((subtotal + taxAmount - discount).toFixed(2));

    const invoice = await this.prisma.salesInvoice.create({
      data: {
        invoiceNumber,
        instituteId,
        customerId,
        soId: dto.soId || undefined,
        invoiceDate,
        dueDate,
        subtotal,
        taxAmount,
        discount,
        grandTotal,
        paymentStatus: PaymentStatus.UNPAID,
        status: InvoiceStatus.DRAFT,
        createdBy: userId!,
        items: {
          createMany: {
            data: itemsData,
          },
        },
      },
    });

    await this.auditService.log({
      userId,
      entityType: 'SALES_INVOICE',
      entityId: invoice.id,
      action: 'CREATE',
      newStatus: InvoiceStatus.DRAFT,
      metadata: { invoiceNumber, instituteId },
    });

    return invoice;
  }

  async getSalesInvoices(query: PaginationQueryDto & { customerId?: string; status?: InvoiceStatus; paymentStatus?: PaymentStatus }, userParam?: any) {
    const { userId, instituteId } = extractUserContext(userParam);
    const { page = 1, limit = 25, search, customerId, status, paymentStatus } = query;
    const skip = (page - 1) * limit;

    let where: any = {};
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { customer: { customerName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    where = scopeWhere(where, instituteId);

    const [invoices, total] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          dueDate: true,
          grandTotal: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
          customer: { select: { id: true, customerCode: true, customerName: true } },
          so: { select: { id: true, soNumber: true } },
          creator: { select: { id: true, name: true } },
          _count: { select: { items: true, receipts: true } },
        },
      }),
      this.prisma.salesInvoice.count({ where }),
    ]);

    return {
      data: invoices,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getSalesInvoiceById(id: string, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const where = scopeWhere({ id }, instituteId);
    const invoice = await this.prisma.salesInvoice.findFirst({
      where,
      select: {
        id: true,
        invoiceNumber: true,
        customerId: true,
        soId: true,
        invoiceDate: true,
        dueDate: true,
        subtotal: true,
        taxAmount: true,
        discount: true,
        grandTotal: true,
        status: true,
        paymentStatus: true,
        createdAt: true,
        updatedAt: true,
        customer: { select: { id: true, customerCode: true, customerName: true, gstin: true } },
        so: { select: { id: true, soNumber: true, soDate: true } },
        creator: { select: { id: true, name: true } },
        poster: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            itemId: true,
            quantity: true,
            unitPrice: true,
            taxCodeId: true,
            cgstAmount: true,
            sgstAmount: true,
            igstAmount: true,
            lineTotal: true,
            item: { select: { id: true, itemCode: true, itemName: true } },
            taxCode: { select: { id: true, name: true, cgstPct: true, sgstPct: true, igstPct: true } },
          },
        },
        receipts: {
          select: {
            id: true,
            receiptNumber: true,
            receiptDate: true,
            amount: true,
            mode: true,
            referenceNo: true,
            createdAt: true,
          },
          orderBy: { receiptDate: 'desc' },
        },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Sales invoice not found.');
    }
    return invoice;
  }

  /**
   * Post Sales Invoice (Atomic Transaction)
   */
  async postSalesInvoice(id: string, userParam: any) {
    const { userId, instituteId } = extractUserContext(userParam);
    const invoice = await this.getSalesInvoiceById(id, userParam);

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(`Cannot post Sales Invoice in status ${invoice.status}. Must be DRAFT.`);
    }

    const postedInvoice = await this.prisma.$transaction(async (tx) => {
      // 1. Stock Availability Check & Deduction (STOCK OUT)
      for (const invItem of invoice.items) {
        const qtyOutNum = Number(invItem.quantity);
        const currentItem = await tx.item.findFirst({
          where: scopeWhere({ id: invItem.itemId }, instituteId),
        });

        if (!currentItem) {
          throw new NotFoundException(`Item ${invItem.itemId} not found.`);
        }

        if (Number(currentItem.quantity) < qtyOutNum) {
          throw new BadRequestException(
            `Insufficient stock for item "${currentItem.itemName}". Available: ${currentItem.quantity}, Requested: ${qtyOutNum}`,
          );
        }

        const updatedItem = await tx.item.update({
          where: { id: invItem.itemId },
          data: {
            quantity: { decrement: qtyOutNum },
          },
        });

        await tx.inventoryTransaction.create({
          data: {
            instituteId,
            itemId: invItem.itemId,
            warehouseId: null,
            transactionType: InventoryTransactionType.SALES_DISPATCH,
            referenceType: 'SALES_INVOICE',
            referenceId: invoice.id,
            documentNumber: invoice.invoiceNumber,
            quantityIn: 0,
            quantityOut: qtyOutNum,
            balanceQuantity: Number(updatedItem.quantity),
            remarks: `Stock OUT via Sales Invoice ${invoice.invoiceNumber}`,
            createdBy: userId!,
          },
        });
      }

      // 2. Update Sales Order invoiced quantities if linked
      if (invoice.soId) {
        let allSoItemsFullyInvoiced = true;
        const so = await tx.salesOrder.findUnique({
          where: { id: invoice.soId },
          include: { items: true },
        });

        if (so) {
          for (const invItem of invoice.items) {
            const matchingSoItem = so.items.find((si) => si.itemId === invItem.itemId);
            if (matchingSoItem) {
              const newInvoicedQty = Number(matchingSoItem.invoicedQty || 0) + Number(invItem.quantity);
              await tx.salesOrderItem.update({
                where: { id: matchingSoItem.id },
                data: { invoicedQty: newInvoicedQty },
              });
              if (newInvoicedQty < Number(matchingSoItem.quantity)) {
                allSoItemsFullyInvoiced = false;
              }
            }
          }

          const targetSoStatus = allSoItemsFullyInvoiced ? SoStatus.INVOICED : SoStatus.PARTIALLY_INVOICED;
          await tx.salesOrder.update({
            where: { id: invoice.soId },
            data: { status: targetSoStatus },
          });
        }
      }

      // 3. Mark Sales Invoice as POSTED
      return tx.salesInvoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.POSTED,
          postedBy: userId!,
          postedAt: new Date(),
        },
      });
    });

    await this.auditService.log({
      userId,
      entityType: 'SALES_INVOICE',
      entityId: id,
      action: 'POST',
      oldStatus: InvoiceStatus.DRAFT,
      newStatus: InvoiceStatus.POSTED,
    });

    return postedInvoice;
  }

  async cancelSalesInvoice(id: string, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const invoice = await this.getSalesInvoiceById(id, userParam);
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Sales Invoice is already cancelled.');
    }

    const cancelledInvoice = await this.prisma.salesInvoice.update({
      where: { id },
      data: { status: InvoiceStatus.CANCELLED },
    });

    await this.auditService.log({
      userId,
      entityType: 'SALES_INVOICE',
      entityId: id,
      action: 'CANCEL',
      oldStatus: invoice.status,
      newStatus: InvoiceStatus.CANCELLED,
    });

    return cancelledInvoice;
  }

  // ==========================================
  // 3. SALES RECEIPTS
  // ==========================================

  async createSalesReceipt(dto: CreateSalesReceiptDto, userParam: any) {
    const { userId, instituteId } = extractUserContext(userParam);
    const invoice = await this.getSalesInvoiceById(dto.salesInvoiceId, userParam);
    if (invoice.status !== InvoiceStatus.POSTED) {
      throw new BadRequestException('Receipts can only be created for POSTED sales invoices.');
    }

    const totalReceipts = invoice.receipts.reduce((sum, r) => sum + Number(r.amount), 0);
    const outstanding = Number(invoice.grandTotal) - totalReceipts;

    if (dto.amount > outstanding) {
      throw new BadRequestException(`Receipt amount (${dto.amount}) exceeds outstanding invoice amount (${outstanding.toFixed(2)}).`);
    }

    const receiptNumber = await this.numberingService.generateNextNumber(DocumentType.RECEIPT);

    const receipt = await this.prisma.$transaction(async (tx) => {
      const newReceipt = await tx.salesReceipt.create({
        data: {
          receiptNumber,
          instituteId,
          salesInvoiceId: dto.salesInvoiceId,
          receiptDate: new Date(dto.receiptDate),
          amount: dto.amount,
          mode: dto.mode,
          referenceNo: dto.referenceNo,
          createdBy: userId!,
        },
      });

      const newTotalReceipts = totalReceipts + dto.amount;
      let newPaymentStatus: PaymentStatus = PaymentStatus.PARTIALLY_PAID;
      if (Math.abs(newTotalReceipts - Number(invoice.grandTotal)) < 0.01) {
        newPaymentStatus = PaymentStatus.PAID;
      }

      await tx.salesInvoice.update({
        where: { id: dto.salesInvoiceId },
        data: { paymentStatus: newPaymentStatus },
      });

      return newReceipt;
    });

    await this.auditService.log({
      userId,
      entityType: 'SALES_RECEIPT',
      entityId: receipt.id,
      action: 'RECEIPT',
      metadata: { invoiceId: dto.salesInvoiceId, amount: dto.amount, instituteId },
    });

    return receipt;
  }

  async getSalesReceipts(query: PaginationQueryDto, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const { page = 1, limit = 25 } = query;
    const skip = (page - 1) * limit;
    const where = scopeWhere({}, instituteId);

    const [receipts, total] = await Promise.all([
      this.prisma.salesReceipt.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          receiptNumber: true,
          receiptDate: true,
          amount: true,
          mode: true,
          referenceNo: true,
          createdAt: true,
          salesInvoice: {
            select: {
              id: true,
              invoiceNumber: true,
              customer: { select: { id: true, customerCode: true, customerName: true } },
            },
          },
          creator: { select: { id: true, name: true } },
        },
      }),
      this.prisma.salesReceipt.count({ where }),
    ]);

    return {
      data: receipts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getInvoiceReceipts(salesInvoiceId: string, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const where = scopeWhere({ salesInvoiceId }, instituteId);
    return this.prisma.salesReceipt.findMany({
      where,
      orderBy: { receiptDate: 'desc' },
    });
  }

  async updateSo(id: string, dto: UpdateSalesOrderDto, userParam: any) {
    const { userId, instituteId } = extractUserContext(userParam);
    const so = await this.getSoById(id, userParam);
    if (so.status !== SoStatus.DRAFT) {
      throw new BadRequestException(`Cannot update Sales Order in status ${so.status}. Must be DRAFT.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let subtotal = Number(so.subtotal);
      let taxAmount = Number(so.taxAmount);
      const discount = dto.discount !== undefined ? dto.discount : Number(so.discount);

      if (dto.items && dto.items.length > 0) {
        await tx.salesOrderItem.deleteMany({ where: { soId: id } });

        subtotal = 0;
        taxAmount = 0;
        const itemsData: any[] = [];

        for (const itemDto of dto.items) {
          const taxCode = await tx.taxCode.findUnique({ where: { id: itemDto.taxCodeId } });
          if (!taxCode) throw new NotFoundException(`Tax code ${itemDto.taxCodeId} not found.`);

          const calc = calculateLineTax(
            itemDto.quantity,
            itemDto.unitPrice,
            0,
            Number(taxCode.cgstPct),
            Number(taxCode.sgstPct),
            Number(taxCode.igstPct),
          );

          subtotal += calc.subtotal;
          taxAmount += calc.totalTax;

          itemsData.push({
            soId: id,
            itemId: itemDto.itemId,
            quantity: itemDto.quantity,
            unitPrice: itemDto.unitPrice,
            taxCodeId: itemDto.taxCodeId,
            lineTotal: calc.lineTotal,
          });
        }

        await tx.salesOrderItem.createMany({ data: itemsData });
      }

      const grandTotal = Number((subtotal + taxAmount - discount).toFixed(2));

      return tx.salesOrder.update({
        where: { id },
        data: {
          customerId: dto.customerId || undefined,
          deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
          discount,
          subtotal,
          taxAmount,
          grandTotal,
        },
        include: {
          customer: true,
          items: { include: { item: true, taxCode: true } },
        },
      });
    });

    await this.auditService.log({
      userId,
      entityType: 'SALES_ORDER',
      entityId: id,
      action: 'UPDATE',
      newStatus: so.status,
    });

    return updated;
  }

  async deleteSo(id: string, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const so = await this.getSoById(id, userParam);
    if (so.status !== SoStatus.DRAFT) {
      throw new BadRequestException(`Cannot delete Sales Order in status ${so.status}. Must be DRAFT.`);
    }

    await this.prisma.salesOrder.delete({ where: { id } });

    await this.auditService.log({
      userId,
      entityType: 'SALES_ORDER',
      entityId: id,
      action: 'DELETE',
      oldStatus: so.status,
    });

    return { message: `Sales Order ${so.soNumber} deleted successfully.` };
  }

  async updateSalesInvoice(id: string, dto: UpdateSalesInvoiceDto, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const invoice = await this.getSalesInvoiceById(id, userParam);
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(`Cannot update Sales Invoice in status ${invoice.status}. Must be DRAFT.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let subtotal = Number(invoice.subtotal);
      let taxAmount = Number(invoice.taxAmount);
      const discount = dto.discount !== undefined ? dto.discount : Number(invoice.discount);

      if (dto.items && dto.items.length > 0) {
        await tx.salesInvoiceItem.deleteMany({ where: { salesInvoiceId: id } });

        subtotal = 0;
        taxAmount = 0;
        const itemsData: any[] = [];

        for (const itemDto of dto.items) {
          const taxCode = await tx.taxCode.findUnique({ where: { id: itemDto.taxCodeId } });
          if (!taxCode) throw new NotFoundException(`Tax code ${itemDto.taxCodeId} not found.`);

          const calc = calculateLineTax(
            itemDto.quantity,
            itemDto.unitPrice,
            0,
            Number(taxCode.cgstPct),
            Number(taxCode.sgstPct),
            Number(taxCode.igstPct),
          );

          subtotal += calc.subtotal;
          taxAmount += calc.totalTax;

          itemsData.push({
            salesInvoiceId: id,
            itemId: itemDto.itemId,
            quantity: itemDto.quantity,
            unitPrice: itemDto.unitPrice,
            taxCodeId: itemDto.taxCodeId,
            cgstAmount: calc.cgstAmount,
            sgstAmount: calc.sgstAmount,
            igstAmount: calc.igstAmount,
            lineTotal: calc.lineTotal,
          });
        }

        await tx.salesInvoiceItem.createMany({ data: itemsData });
      }

      const grandTotal = Number((subtotal + taxAmount - discount).toFixed(2));

      return tx.salesInvoice.update({
        where: { id },
        data: {
          customerId: dto.customerId || undefined,
          soId: dto.soId || undefined,
          invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined,
          discount,
          subtotal,
          taxAmount,
          grandTotal,
        },
        include: {
          customer: true,
          items: { include: { item: true, taxCode: true } },
        },
      });
    });

    await this.auditService.log({
      userId,
      entityType: 'SALES_INVOICE',
      entityId: id,
      action: 'UPDATE',
      newStatus: invoice.status,
    });

    return updated;
  }

  async deleteSalesInvoice(id: string, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const invoice = await this.getSalesInvoiceById(id, userParam);
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(`Cannot delete Sales Invoice in status ${invoice.status}. Must be DRAFT.`);
    }

    await this.prisma.salesInvoice.delete({ where: { id } });

    await this.auditService.log({
      userId,
      entityType: 'SALES_INVOICE',
      entityId: id,
      action: 'DELETE',
      oldStatus: invoice.status,
    });

    return { message: `Sales Invoice ${invoice.invoiceNumber} deleted successfully.` };
  }

  async getSalesReceiptById(id: string, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const where = scopeWhere({ id }, instituteId);
    const receipt = await this.prisma.salesReceipt.findFirst({
      where,
      include: {
        salesInvoice: { include: { customer: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });
    if (!receipt) throw new NotFoundException('Sales Receipt not found.');
    return receipt;
  }

  async updateSalesReceipt(id: string, dto: UpdateSalesReceiptDto, userParam: any) {
    const receipt = await this.getSalesReceiptById(id, userParam);
    const updated = await this.prisma.salesReceipt.update({
      where: { id },
      data: {
        receiptDate: dto.receiptDate ? new Date(dto.receiptDate) : undefined,
        amount: dto.amount !== undefined ? dto.amount : undefined,
        mode: dto.mode || undefined,
        referenceNo: dto.referenceNo !== undefined ? dto.referenceNo : undefined,
      },
    });

    if (dto.amount !== undefined && dto.amount !== Number(receipt.amount)) {
      const invoice = await this.getSalesInvoiceById(receipt.salesInvoiceId, userParam);
      const totalReceipts = invoice.receipts.reduce((sum, r) => sum + Number(r.amount), 0);
      let newPaymentStatus: PaymentStatus = PaymentStatus.PARTIALLY_PAID;
      if (Math.abs(totalReceipts - Number(invoice.grandTotal)) < 0.01) {
        newPaymentStatus = PaymentStatus.PAID;
      } else if (totalReceipts <= 0) {
        newPaymentStatus = PaymentStatus.UNPAID;
      }

      await this.prisma.salesInvoice.update({
        where: { id: receipt.salesInvoiceId },
        data: { paymentStatus: newPaymentStatus },
      });
    }

    return updated;
  }

  async deleteSalesReceipt(id: string, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const receipt = await this.getSalesReceiptById(id, userParam);
    const invoiceId = receipt.salesInvoiceId;

    await this.prisma.$transaction(async (tx) => {
      await tx.salesReceipt.delete({ where: { id } });

      const remainingReceipts = await tx.salesReceipt.findMany({ where: { salesInvoiceId: invoiceId } });
      const invoice = await tx.salesInvoice.findUnique({ where: { id: invoiceId } });

      if (invoice) {
        const total = remainingReceipts.reduce((sum, r) => sum + Number(r.amount), 0);
        let newStatus: PaymentStatus = PaymentStatus.UNPAID;
        if (total > 0) {
          newStatus = Math.abs(total - Number(invoice.grandTotal)) < 0.01 ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID;
        }

        await tx.salesInvoice.update({
          where: { id: invoiceId },
          data: { paymentStatus: newStatus },
        });
      }
    });

    await this.auditService.log({
      userId,
      entityType: 'SALES_RECEIPT',
      entityId: id,
      action: 'DELETE',
      metadata: { receiptNumber: receipt.receiptNumber },
    });

    return { message: `Sales Receipt ${receipt.receiptNumber} deleted successfully.` };
  }

  async voidSalesReceipt(id: string, userParam: any) {
    return this.deleteSalesReceipt(id, userParam);
  }
}
