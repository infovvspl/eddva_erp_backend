import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildMeta,
  parsePagination,
  parseSortOrder,
} from '../common/pagination.util';
import {
  PurchaseRegisterQueryDto,
  SalesRegisterQueryDto,
} from './dto/register-query.dto';

/**
 * Purchase Register / Sales Register (module spec §35/§36/§37) are read-only
 * queries over sp_purchase_invoices / sp_sales_invoices where status =
 * POSTED — there is deliberately no separate register table. If a register
 * total looks wrong, the fix is in the invoice data, never a reconciliation
 * step against a second source.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async purchaseRegister(instituteId: string, query: PurchaseRegisterQueryDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortOrder = parseSortOrder(query.sortOrder);

    const invoiceWhere: any = {
      institute_id: instituteId,
      status: 'POSTED',
      vendor_id: query.vendor_id,
      payment_status: query.payment_status,
      vendor_invoice_number: query.vendor_invoice_number,
      invoice_number: query.invoice_number,
      invoice_date:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
    if (query.search) {
      invoiceWhere.OR = [
        { invoice_number: { contains: query.search, mode: 'insensitive' } },
        {
          vendor_invoice_number: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
        {
          vendor: {
            vendor_name: { contains: query.search, mode: 'insensitive' },
          },
        },
      ];
    }

    const itemWhere = { invoice: invoiceWhere };

    const [data, total, taxSummary, invoiceSummary] =
      await this.prisma.$transaction([
        this.prisma.spPurchaseInvoiceItem.findMany({
          where: itemWhere,
          include: {
            item: {
              select: { item_id: true, item_code: true, item_name: true },
            },
            invoice: {
              select: {
                invoice_number: true,
                vendor_invoice_number: true,
                invoice_date: true,
                payment_status: true,
                vendor: {
                  select: {
                    vendor_id: true,
                    vendor_name: true,
                    vendor_code: true,
                  },
                },
              },
            },
          },
          orderBy: { invoice: { invoice_date: sortOrder } },
          skip,
          take,
        }),
        this.prisma.spPurchaseInvoiceItem.count({ where: itemWhere }),
        this.prisma.spPurchaseInvoiceItem.aggregate({
          where: itemWhere,
          _sum: {
            cgst_amount: true,
            sgst_amount: true,
            igst_amount: true,
            line_discount: true,
          },
        }),
        this.prisma.spPurchaseInvoice.aggregate({
          where: invoiceWhere,
          _sum: {
            subtotal: true,
            tax_amount: true,
            discount: true,
            grand_total: true,
          },
          _count: { pi_id: true },
        }),
      ]);

    return {
      data: data.map((line) => ({
        invoiceNumber: line.invoice.invoice_number,
        vendorInvoiceNumber: line.invoice.vendor_invoice_number,
        invoiceDate: line.invoice.invoice_date,
        vendor: line.invoice.vendor,
        item: line.item,
        quantity: line.quantity,
        taxableValue:
          Number(line.line_total) -
          Number(line.cgst_amount) -
          Number(line.sgst_amount) -
          Number(line.igst_amount) +
          Number(line.line_discount),
        cgst: line.cgst_amount,
        sgst: line.sgst_amount,
        igst: line.igst_amount,
        discount: line.line_discount,
        lineTotal: line.line_total,
        paymentStatus: line.invoice.payment_status,
      })),
      pagination: buildMeta(total, page, limit),
      summary: {
        invoiceCount: invoiceSummary._count.pi_id,
        totalCgst: taxSummary._sum.cgst_amount ?? 0,
        totalSgst: taxSummary._sum.sgst_amount ?? 0,
        totalIgst: taxSummary._sum.igst_amount ?? 0,
        totalDiscount: invoiceSummary._sum.discount ?? 0,
        totalSubtotal: invoiceSummary._sum.subtotal ?? 0,
        totalTax: invoiceSummary._sum.tax_amount ?? 0,
        totalGrandTotal: invoiceSummary._sum.grand_total ?? 0,
      },
    };
  }

  async salesRegister(instituteId: string, query: SalesRegisterQueryDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortOrder = parseSortOrder(query.sortOrder);

    const invoiceWhere: any = {
      institute_id: instituteId,
      status: 'POSTED',
      customer_id: query.customer_id,
      payment_status: query.payment_status,
      invoice_number: query.invoice_number,
      invoice_date:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
    if (query.search) {
      invoiceWhere.OR = [
        { invoice_number: { contains: query.search, mode: 'insensitive' } },
        {
          customer: {
            customer_name: { contains: query.search, mode: 'insensitive' },
          },
        },
      ];
    }

    const itemWhere = { invoice: invoiceWhere };

    const [data, total, taxSummary, invoiceSummary] =
      await this.prisma.$transaction([
        this.prisma.spSalesInvoiceItem.findMany({
          where: itemWhere,
          include: {
            item: {
              select: { item_id: true, item_code: true, item_name: true },
            },
            invoice: {
              select: {
                invoice_number: true,
                invoice_date: true,
                payment_status: true,
                customer: {
                  select: {
                    customer_id: true,
                    customer_name: true,
                    customer_code: true,
                  },
                },
              },
            },
          },
          orderBy: { invoice: { invoice_date: sortOrder } },
          skip,
          take,
        }),
        this.prisma.spSalesInvoiceItem.count({ where: itemWhere }),
        this.prisma.spSalesInvoiceItem.aggregate({
          where: itemWhere,
          _sum: {
            cgst_amount: true,
            sgst_amount: true,
            igst_amount: true,
            line_discount: true,
          },
        }),
        this.prisma.spSalesInvoice.aggregate({
          where: invoiceWhere,
          _sum: {
            subtotal: true,
            tax_amount: true,
            discount: true,
            grand_total: true,
          },
          _count: { si_id: true },
        }),
      ]);

    return {
      data: data.map((line) => ({
        invoiceNumber: line.invoice.invoice_number,
        invoiceDate: line.invoice.invoice_date,
        customer: line.invoice.customer,
        item: line.item,
        quantity: line.quantity,
        taxableValue:
          Number(line.line_total) -
          Number(line.cgst_amount) -
          Number(line.sgst_amount) -
          Number(line.igst_amount) +
          Number(line.line_discount),
        cgst: line.cgst_amount,
        sgst: line.sgst_amount,
        igst: line.igst_amount,
        discount: line.line_discount,
        lineTotal: line.line_total,
        paymentStatus: line.invoice.payment_status,
      })),
      pagination: buildMeta(total, page, limit),
      summary: {
        invoiceCount: invoiceSummary._count.si_id,
        totalCgst: taxSummary._sum.cgst_amount ?? 0,
        totalSgst: taxSummary._sum.sgst_amount ?? 0,
        totalIgst: taxSummary._sum.igst_amount ?? 0,
        totalDiscount: invoiceSummary._sum.discount ?? 0,
        totalSubtotal: invoiceSummary._sum.subtotal ?? 0,
        totalTax: invoiceSummary._sum.tax_amount ?? 0,
        totalGrandTotal: invoiceSummary._sum.grand_total ?? 0,
      },
    };
  }
}
