import { Injectable } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { extractUserContext, scopeWhere } from '../common/utils/institute-scope.util';
import {
  PurchaseRegisterQueryDto,
  SalesRegisterQueryDto,
} from './dto/register-query.dto';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Purchase Register Report Query (READ-ONLY) over POSTED purchase invoices
   */
  async getPurchaseRegister(query: PurchaseRegisterQueryDto, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const {
      page = 1,
      limit = 25,
      from,
      to,
      vendor_id,
      invoice_number,
      gstin,
      payment_status,
      search,
    } = query;
    const skip = (page - 1) * limit;

    let where: any = {
      status: InvoiceStatus.POSTED,
    };

    if (vendor_id) where.vendorId = vendor_id;
    if (payment_status) where.paymentStatus = payment_status;
    if (invoice_number) {
      where.invoiceNumber = { contains: invoice_number, mode: 'insensitive' };
    }
    if (from || to) {
      where.invoiceDate = {};
      if (from) where.invoiceDate.gte = new Date(from);
      if (to) where.invoiceDate.lte = new Date(to);
    }
    if (gstin) {
      where.vendor = { gstin: { contains: gstin, mode: 'insensitive' } };
    }
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { vendorInvoiceNumber: { contains: search, mode: 'insensitive' } },
        { vendor: { vendorName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    where = scopeWhere(where, instituteId);

    const [invoices, total, totalSummary] = await Promise.all([
      this.prisma.purchaseInvoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { invoiceDate: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          vendorInvoiceNumber: true,
          invoiceDate: true,
          dueDate: true,
          subtotal: true,
          taxAmount: true,
          discount: true,
          grandTotal: true,
          status: true,
          paymentStatus: true,
          vendor: { select: { id: true, vendorCode: true, vendorName: true, gstin: true } },
          items: {
            select: {
              id: true,
              itemId: true,
              quantity: true,
              unitPrice: true,
              cgstAmount: true,
              sgstAmount: true,
              igstAmount: true,
              lineTotal: true,
              item: { select: { id: true, itemCode: true, itemName: true, hsnSacCode: true } },
              taxCode: { select: { id: true, name: true, cgstPct: true, sgstPct: true, igstPct: true } },
            },
          },
        },
      }),
      this.prisma.purchaseInvoice.count({ where }),
      this.prisma.purchaseInvoice.aggregate({
        where,
        _sum: {
          subtotal: true,
          taxAmount: true,
          grandTotal: true,
        },
      }),
    ]);

    return {
      data: invoices,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      summary: {
        subtotal: Number(totalSummary._sum.subtotal || 0),
        tax: Number(totalSummary._sum.taxAmount || 0),
        grand_total: Number(totalSummary._sum.grandTotal || 0),
      },
    };
  }

  /**
   * Sales Register Report Query (READ-ONLY) over POSTED sales invoices
   */
  async getSalesRegister(query: SalesRegisterQueryDto, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const {
      page = 1,
      limit = 25,
      from,
      to,
      customer_id,
      invoice_number,
      gstin,
      payment_status,
      search,
    } = query;
    const skip = (page - 1) * limit;

    let where: any = {
      status: InvoiceStatus.POSTED,
    };

    if (customer_id) where.customerId = customer_id;
    if (payment_status) where.paymentStatus = payment_status;
    if (invoice_number) {
      where.invoiceNumber = { contains: invoice_number, mode: 'insensitive' };
    }
    if (from || to) {
      where.invoiceDate = {};
      if (from) where.invoiceDate.gte = new Date(from);
      if (to) where.invoiceDate.lte = new Date(to);
    }
    if (gstin) {
      where.customer = { gstin: { contains: gstin, mode: 'insensitive' } };
    }
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { customer: { customerName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    where = scopeWhere(where, instituteId);

    const [invoices, total, totalSummary] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { invoiceDate: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          dueDate: true,
          subtotal: true,
          taxAmount: true,
          discount: true,
          grandTotal: true,
          status: true,
          paymentStatus: true,
          customer: { select: { id: true, customerCode: true, customerName: true, gstin: true } },
          items: {
            select: {
              id: true,
              itemId: true,
              quantity: true,
              unitPrice: true,
              cgstAmount: true,
              sgstAmount: true,
              igstAmount: true,
              lineTotal: true,
              item: { select: { id: true, itemCode: true, itemName: true, hsnSacCode: true } },
              taxCode: { select: { id: true, name: true, cgstPct: true, sgstPct: true, igstPct: true } },
            },
          },
        },
      }),
      this.prisma.salesInvoice.count({ where }),
      this.prisma.salesInvoice.aggregate({
        where,
        _sum: {
          subtotal: true,
          taxAmount: true,
          grandTotal: true,
        },
      }),
    ]);

    return {
      data: invoices,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      summary: {
        subtotal: Number(totalSummary._sum.subtotal || 0),
        tax: Number(totalSummary._sum.taxAmount || 0),
        grand_total: Number(totalSummary._sum.grandTotal || 0),
      },
    };
  }
}
