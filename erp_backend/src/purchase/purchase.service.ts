import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DocumentType,
  PoStatus,
  GrnStatus,
  InvoiceStatus,
  PaymentStatus,
  PoApprovalAction,
  InventoryTransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NumberingService } from '../numbering/numbering.service';
import { AuditService } from '../audit/audit.service';
import { MatchService } from './match.service';
import { calculateLineTax } from '../common/utils/tax-calculator';
import { extractUserContext, scopeWhere } from '../common/utils/institute-scope.util';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  ApprovalActionDto,
} from './dto/purchase-order.dto';
import { CreateGrnDto, UpdateGrnDto } from './dto/grn.dto';
import {
  CreatePurchaseInvoiceDto,
  UpdatePurchaseInvoiceDto,
  CreatePurchasePaymentDto,
  UpdatePurchasePaymentDto,
} from './dto/purchase-invoice.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class PurchaseService {
  constructor(
    private prisma: PrismaService,
    private numberingService: NumberingService,
    private auditService: AuditService,
    private matchService: MatchService,
  ) {}

  // ==========================================
  // 1. PURCHASE ORDER MANAGEMENT
  // ==========================================

  async createPo(dto: CreatePurchaseOrderDto, userParam: any) {
    const { userId, instituteId } = extractUserContext(userParam);
    const poNumber = await this.numberingService.generateNextNumber(DocumentType.PO);
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

    const po = await this.prisma.purchaseOrder.create({
      data: {
        poNumber,
        instituteId,
        vendorId: dto.vendorId,
        poDate: new Date(dto.poDate),
        expectedDeliveryDate: new Date(dto.expectedDeliveryDate),
        warehouseId: dto.warehouseId,
        discount,
        subtotal,
        taxAmount,
        grandTotal,
        status: PoStatus.DRAFT,
        createdBy: userId!,
        items: {
          createMany: {
            data: itemsData,
          },
        },
      },
      include: {
        vendor: true,
        warehouse: true,
        items: { include: { item: true, taxCode: true } },
      },
    });

    await this.auditService.log({
      userId,
      entityType: 'PURCHASE_ORDER',
      entityId: po.id,
      action: 'CREATE',
      newStatus: PoStatus.DRAFT,
      metadata: { poNumber, instituteId },
    });

    return po;
  }

  async getPos(query: PaginationQueryDto & { vendorId?: string; status?: PoStatus; dateFrom?: string; dateTo?: string; poNumber?: string }, userParam?: any) {
    const { userId, instituteId } = extractUserContext(userParam);
    const { page = 1, limit = 25, search, vendorId, status, dateFrom, dateTo, poNumber } = query;
    const skip = (page - 1) * limit;

    let where: any = {};
    if (vendorId) where.vendorId = vendorId;
    if (status) where.status = status;
    if (poNumber) where.poNumber = { contains: poNumber, mode: 'insensitive' };
    if (dateFrom || dateTo) {
      where.poDate = {};
      if (dateFrom) where.poDate.gte = new Date(dateFrom);
      if (dateTo) where.poDate.lte = new Date(dateTo);
    }
    if (search) {
      where.OR = [
        { poNumber: { contains: search, mode: 'insensitive' } },
        { vendor: { vendorName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    where = scopeWhere(where, instituteId);

    const [pos, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          poNumber: true,
          poDate: true,
          expectedDeliveryDate: true,
          status: true,
          grandTotal: true,
          createdAt: true,
          vendor: { select: { id: true, vendorCode: true, vendorName: true } },
          warehouse: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return {
      data: pos,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getPoById(id: string, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const where = scopeWhere({ id }, instituteId);
    const po = await this.prisma.purchaseOrder.findFirst({
      where,
      select: {
        id: true,
        poNumber: true,
        poDate: true,
        expectedDeliveryDate: true,
        status: true,
        subtotal: true,
        taxAmount: true,
        discount: true,
        grandTotal: true,
        createdAt: true,
        updatedAt: true,
        vendor: { select: { id: true, vendorCode: true, vendorName: true, gstin: true } },
        warehouse: { select: { id: true, name: true, address: true } },
        creator: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
        items: {
          select: {
            id: true,
            poId: true,
            itemId: true,
            quantity: true,
            unitPrice: true,
            taxCodeId: true,
            lineTotal: true,
            receivedQty: true,
            item: { select: { id: true, itemCode: true, itemName: true } },
            taxCode: { select: { id: true, name: true, cgstPct: true, sgstPct: true, igstPct: true } },
          },
        },
        approvals: {
          select: {
            id: true,
            action: true,
            actionAt: true,
            approver: { select: { id: true, name: true } },
          },
          orderBy: { actionAt: 'asc' },
        },
        goodsReceiptNotes: {
          select: { id: true, grnNumber: true, status: true, receivedDate: true },
        },
        purchaseInvoices: {
          select: { id: true, invoiceNumber: true, status: true, paymentStatus: true, grandTotal: true },
        },
      },
    });
    if (!po) {
      throw new NotFoundException('Purchase order not found.');
    }
    return po;
  }

  async submitPo(id: string, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const po = await this.getPoById(id, userParam);
    if (po.status !== PoStatus.DRAFT) {
      throw new BadRequestException(`Cannot submit PO in status ${po.status}. Must be DRAFT.`);
    }

    const rule = await this.prisma.approvalRule.findFirst({
      where: {
        documentType: DocumentType.PO,
        minAmount: { lte: po.grandTotal },
        OR: [
          { maxAmount: { gte: po.grandTotal } },
          { maxAmount: null },
        ],
        status: 'ACTIVE',
      },
      orderBy: { approvalLevel: 'asc' },
    });

    let newStatus: PoStatus = PoStatus.PENDING_APPROVAL;
    if (!rule) {
      newStatus = PoStatus.APPROVED;
    }

    const updatedPo = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: newStatus,
        approvedBy: newStatus === PoStatus.APPROVED ? userId : undefined,
      },
    });

    await this.prisma.poApproval.create({
      data: {
        poId: id,
        approverId: userId!,
        action: PoApprovalAction.SUBMIT,
        remarks: newStatus === PoStatus.APPROVED ? 'Auto-approved (No rule match)' : 'Submitted for approval',
        approvalLevel: rule ? rule.approvalLevel : 1,
      },
    });

    await this.auditService.log({
      userId,
      entityType: 'PURCHASE_ORDER',
      entityId: id,
      action: 'SUBMIT',
      oldStatus: PoStatus.DRAFT,
      newStatus,
    });

    return updatedPo;
  }

  async approvePo(id: string, userParam: any, dto: ApprovalActionDto) {
    const { userId } = extractUserContext(userParam);
    const po = await this.getPoById(id, userParam);
    if (po.status !== PoStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Cannot approve PO in status ${po.status}. Must be PENDING_APPROVAL.`);
    }

    const updatedPo = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PoStatus.APPROVED,
        approvedBy: userId,
      },
    });

    await this.prisma.poApproval.create({
      data: {
        poId: id,
        approverId: userId!,
        action: PoApprovalAction.APPROVE,
        remarks: dto.remarks || 'Approved',
        approvalLevel: 1,
      },
    });

    await this.auditService.log({
      userId,
      entityType: 'PURCHASE_ORDER',
      entityId: id,
      action: 'APPROVE',
      oldStatus: PoStatus.PENDING_APPROVAL,
      newStatus: PoStatus.APPROVED,
      metadata: { remarks: dto.remarks },
    });

    return updatedPo;
  }

  async rejectPo(id: string, userParam: any, dto: ApprovalActionDto) {
    const { userId } = extractUserContext(userParam);
    const po = await this.getPoById(id, userParam);
    if (po.status !== PoStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Cannot reject PO in status ${po.status}. Must be PENDING_APPROVAL.`);
    }

    const updatedPo = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PoStatus.REJECTED,
      },
    });

    await this.prisma.poApproval.create({
      data: {
        poId: id,
        approverId: userId!,
        action: PoApprovalAction.REJECT,
        remarks: dto.remarks || 'Rejected',
        approvalLevel: 1,
      },
    });

    await this.auditService.log({
      userId,
      entityType: 'PURCHASE_ORDER',
      entityId: id,
      action: 'REJECT',
      oldStatus: PoStatus.PENDING_APPROVAL,
      newStatus: PoStatus.REJECTED,
      metadata: { remarks: dto.remarks },
    });

    return updatedPo;
  }

  async cancelPo(id: string, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const po = await this.getPoById(id, userParam);
    if (po.status === PoStatus.CLOSED || po.status === PoStatus.CANCELLED) {
      throw new BadRequestException(`Cannot cancel PO in status ${po.status}.`);
    }

    const updatedPo = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PoStatus.CANCELLED },
    });

    await this.auditService.log({
      userId,
      entityType: 'PURCHASE_ORDER',
      entityId: id,
      action: 'CANCEL',
      oldStatus: po.status,
      newStatus: PoStatus.CANCELLED,
    });

    return updatedPo;
  }

  async getPoHistory(id: string, userParam?: any) {
    await this.getPoById(id, userParam);
    return this.auditService.getLogsForEntity('PURCHASE_ORDER', id);
  }

  // ==========================================
  // 2. GOODS RECEIPT NOTE (GRN)
  // ==========================================

  async createGrn(dto: CreateGrnDto, userParam: any) {
    const { userId, instituteId } = extractUserContext(userParam);
    const po = await this.getPoById(dto.poId, userParam);
    if (po.status !== PoStatus.APPROVED && po.status !== PoStatus.PARTIALLY_RECEIVED) {
      throw new BadRequestException(`Cannot create GRN for PO in status ${po.status}. PO must be APPROVED or PARTIALLY_RECEIVED.`);
    }

    const grnNumber = await this.numberingService.generateNextNumber(DocumentType.GRN);

    const poItemsMap = new Map(po.items.map((pi: any) => [pi.id, pi]));
    const itemsData: any[] = [];

    for (const itemDto of dto.items) {
      const poItem = poItemsMap.get(itemDto.poItemId);
      if (!poItem) {
        throw new BadRequestException(`PO item ${itemDto.poItemId} does not belong to PO ${po.poNumber}.`);
      }

      if (itemDto.acceptedQty + itemDto.rejectedQty > itemDto.receivedQty) {
        throw new BadRequestException(`For item ${itemDto.itemId}, acceptedQty (${itemDto.acceptedQty}) + rejectedQty (${itemDto.rejectedQty}) cannot exceed receivedQty (${itemDto.receivedQty}).`);
      }

      itemsData.push({
        poItemId: itemDto.poItemId,
        itemId: itemDto.itemId,
        receivedQty: itemDto.receivedQty,
        acceptedQty: itemDto.acceptedQty,
        rejectedQty: itemDto.rejectedQty,
      });
    }

    const grn = await this.prisma.goodsReceiptNote.create({
      data: {
        grnNumber,
        instituteId,
        poId: dto.poId,
        vendorId: dto.vendorId,
        receivedDate: new Date(dto.receivedDate),
        warehouseId: dto.warehouseId,
        status: GrnStatus.DRAFT,
        createdBy: userId!,
        items: {
          createMany: {
            data: itemsData,
          },
        },
      },
      include: {
        po: true,
        vendor: true,
        warehouse: true,
        items: { include: { item: true } },
      },
    });

    await this.auditService.log({
      userId,
      entityType: 'GRN',
      entityId: grn.id,
      action: 'CREATE',
      newStatus: GrnStatus.DRAFT,
      metadata: { instituteId },
    });

    return grn;
  }

  async getGrns(query: PaginationQueryDto, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const { page = 1, limit = 25, search } = query;
    const skip = (page - 1) * limit;

    let where: any = {};
    if (search) {
      where.OR = [
        { grnNumber: { contains: search, mode: 'insensitive' } },
        { po: { poNumber: { contains: search, mode: 'insensitive' } } },
      ];
    }
    where = scopeWhere(where, instituteId);

    const [grns, total] = await Promise.all([
      this.prisma.goodsReceiptNote.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          grnNumber: true,
          receivedDate: true,
          status: true,
          createdAt: true,
          po: { select: { id: true, poNumber: true } },
          vendor: { select: { id: true, vendorCode: true, vendorName: true } },
          warehouse: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.goodsReceiptNote.count({ where }),
    ]);

    return {
      data: grns,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getGrnById(id: string, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const where = scopeWhere({ id }, instituteId);
    const grn = await this.prisma.goodsReceiptNote.findFirst({
      where,
      select: {
        id: true,
        grnNumber: true,
        poId: true,
        vendorId: true,
        warehouseId: true,
        receivedDate: true,
        status: true,
        createdAt: true,
        po: { select: { id: true, poNumber: true, poDate: true } },
        vendor: { select: { id: true, vendorCode: true, vendorName: true } },
        warehouse: { select: { id: true, name: true, address: true } },
        creator: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            grnId: true,
            poItemId: true,
            itemId: true,
            receivedQty: true,
            acceptedQty: true,
            rejectedQty: true,
            item: { select: { id: true, itemCode: true, itemName: true } },
            poItem: { select: { id: true, quantity: true, unitPrice: true } },
          },
        },
      },
    });
    if (!grn) {
      throw new NotFoundException('GRN not found.');
    }
    return grn;
  }

  async confirmGrn(id: string, userParam: any) {
    const { userId, instituteId } = extractUserContext(userParam);
    const grn = await this.getGrnById(id, userParam);
    if (grn.status !== GrnStatus.DRAFT) {
      throw new BadRequestException(`Cannot confirm GRN in status ${grn.status}. Must be DRAFT.`);
    }

    await this.prisma.$transaction(async (tx) => {
      let allFullyReceived = true;

      for (const grnItem of grn.items) {
        const acceptedQtyNum = Number(grnItem.acceptedQty);

        const updatedPoItem = await tx.purchaseOrderItem.update({
          where: { id: grnItem.poItemId },
          data: {
            receivedQty: { increment: acceptedQtyNum },
          },
        });

        if (Number(updatedPoItem.receivedQty) < Number(updatedPoItem.quantity)) {
          allFullyReceived = false;
        }

        // STOCK IN: Only ACCEPTED quantity enters physical stock
        if (acceptedQtyNum > 0) {
          const updatedItem = await tx.item.update({
            where: { id: grnItem.itemId },
            data: {
              quantity: { increment: acceptedQtyNum },
            },
          });

          await tx.inventoryTransaction.create({
            data: {
              instituteId,
              itemId: grnItem.itemId,
              warehouseId: grn.warehouseId,
              transactionType: InventoryTransactionType.PURCHASE_GRN,
              referenceType: 'GRN',
              referenceId: grn.id,
              documentNumber: grn.grnNumber,
              quantityIn: acceptedQtyNum,
              quantityOut: 0,
              balanceQuantity: Number(updatedItem.quantity),
              remarks: `Stock IN via GRN ${grn.grnNumber} (Accepted: ${acceptedQtyNum})`,
              createdBy: userId!,
            },
          });
        }
      }

      const targetPoStatus = allFullyReceived ? PoStatus.CLOSED : PoStatus.PARTIALLY_RECEIVED;
      await tx.purchaseOrder.update({
        where: { id: grn.poId },
        data: { status: targetPoStatus },
      });

      await tx.goodsReceiptNote.update({
        where: { id },
        data: { status: GrnStatus.CONFIRMED },
      });
    });

    await this.auditService.log({
      userId,
      entityType: 'GRN',
      entityId: id,
      action: 'CONFIRM',
      oldStatus: GrnStatus.DRAFT,
      newStatus: GrnStatus.CONFIRMED,
    });

    return this.getGrnById(id, userParam);
  }

  async cancelGrn(id: string, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const grn = await this.getGrnById(id, userParam);
    if (grn.status === GrnStatus.CANCELLED) {
      throw new BadRequestException('GRN is already cancelled.');
    }

    await this.prisma.goodsReceiptNote.update({
      where: { id },
      data: { status: GrnStatus.CANCELLED },
    });

    await this.auditService.log({
      userId,
      entityType: 'GRN',
      entityId: id,
      action: 'CANCEL',
      oldStatus: grn.status,
      newStatus: GrnStatus.CANCELLED,
    });

    return { success: true };
  }

  async getPoGrns(poId: string, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const where = scopeWhere({ poId }, instituteId);
    return this.prisma.goodsReceiptNote.findMany({
      where,
      include: { items: { include: { item: true } } },
    });
  }

  // ==========================================
  // 3. PURCHASE INVOICE & 3-WAY MATCHING
  // ==========================================

  async createPurchaseInvoice(dto: CreatePurchaseInvoiceDto, userParam: any) {
    const { userId, instituteId } = extractUserContext(userParam);
    const vendor = await this.prisma.vendor.findFirst({
      where: scopeWhere({ id: dto.vendorId }, instituteId),
      include: { paymentTerm: true },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found.');
    }

    const invoiceNumber = await this.numberingService.generateNextNumber(DocumentType.PURCHASE_INVOICE);
    const invoiceDate = new Date(dto.invoiceDate);
    const daysToAdd = vendor.paymentTerm ? vendor.paymentTerm.days : 0;
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + daysToAdd);

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
        cgstAmount: calc.cgstAmount,
        sgstAmount: calc.sgstAmount,
        igstAmount: calc.igstAmount,
        lineTotal: calc.lineTotal,
      });
    }

    const grandTotal = Number((subtotal + taxAmount - discount).toFixed(2));

    const invoice = await this.prisma.purchaseInvoice.create({
      data: {
        invoiceNumber,
        instituteId,
        vendorInvoiceNumber: dto.vendorInvoiceNumber,
        vendorId: dto.vendorId,
        poId: dto.poId || undefined,
        grnId: dto.grnId || undefined,
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
      include: {
        vendor: true,
        po: true,
        grn: true,
        items: { include: { item: true, taxCode: true } },
      },
    });

    await this.auditService.log({
      userId,
      entityType: 'PURCHASE_INVOICE',
      entityId: invoice.id,
      action: 'CREATE',
      newStatus: InvoiceStatus.DRAFT,
      metadata: { invoiceNumber, instituteId },
    });

    return invoice;
  }

  async getPurchaseInvoices(query: PaginationQueryDto & { vendorId?: string; status?: InvoiceStatus; paymentStatus?: PaymentStatus }, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const { page = 1, limit = 25, search, vendorId, status, paymentStatus } = query;
    const skip = (page - 1) * limit;

    let where: any = {};
    if (vendorId) where.vendorId = vendorId;
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { vendorInvoiceNumber: { contains: search, mode: 'insensitive' } },
      ];
    }
    where = scopeWhere(where, instituteId);

    const [invoices, total] = await Promise.all([
      this.prisma.purchaseInvoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          vendorInvoiceNumber: true,
          invoiceDate: true,
          dueDate: true,
          grandTotal: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
          vendor: { select: { id: true, vendorCode: true, vendorName: true } },
          po: { select: { id: true, poNumber: true } },
          grn: { select: { id: true, grnNumber: true } },
          creator: { select: { id: true, name: true } },
          _count: { select: { items: true, payments: true } },
        },
      }),
      this.prisma.purchaseInvoice.count({ where }),
    ]);

    return {
      data: invoices,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getPurchaseInvoiceById(id: string, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const where = scopeWhere({ id }, instituteId);
    const invoice = await this.prisma.purchaseInvoice.findFirst({
      where,
      select: {
        id: true,
        invoiceNumber: true,
        vendorInvoiceNumber: true,
        vendorId: true,
        poId: true,
        grnId: true,
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
        vendor: { select: { id: true, vendorCode: true, vendorName: true, gstin: true } },
        po: { select: { id: true, poNumber: true, poDate: true } },
        grn: { select: { id: true, grnNumber: true, receivedDate: true } },
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
        payments: {
          select: {
            id: true,
            paymentNumber: true,
            paymentDate: true,
            amount: true,
            mode: true,
            referenceNo: true,
            createdAt: true,
          },
          orderBy: { paymentDate: 'desc' },
        },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found.');
    }
    return invoice;
  }

  async validatePurchaseInvoice(id: string, userParam?: any) {
    return this.matchService.matchPurchaseInvoice(id, userParam);
  }

  /**
   * Post Purchase Invoice (Atomic Transaction with 3-way match validation)
   */
  async postPurchaseInvoice(id: string, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const invoice = await this.getPurchaseInvoiceById(id, userParam);

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(`Cannot post Purchase Invoice in status ${invoice.status}. Must be DRAFT.`);
    }

    const matchResult = await this.matchService.matchPurchaseInvoice(id, userParam);
    if (!matchResult.matched) {
      throw new UnprocessableEntityException({
        code: 'PURCHASE_INVOICE_MISMATCH',
        message: 'Purchase invoice failed 3-way matching.',
        details: matchResult.mismatches,
      });
    }

    const postedInvoice = await this.prisma.$transaction(async (tx) => {
      return tx.purchaseInvoice.update({
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
      entityType: 'PURCHASE_INVOICE',
      entityId: id,
      action: 'POST',
      oldStatus: InvoiceStatus.DRAFT,
      newStatus: InvoiceStatus.POSTED,
    });

    return postedInvoice;
  }

  async cancelPurchaseInvoice(id: string, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const invoice = await this.getPurchaseInvoiceById(id, userParam);
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Purchase Invoice is already cancelled.');
    }

    const cancelledInvoice = await this.prisma.purchaseInvoice.update({
      where: { id },
      data: { status: InvoiceStatus.CANCELLED },
    });

    await this.auditService.log({
      userId,
      entityType: 'PURCHASE_INVOICE',
      entityId: id,
      action: 'CANCEL',
      oldStatus: invoice.status,
      newStatus: InvoiceStatus.CANCELLED,
    });

    return cancelledInvoice;
  }

  // ==========================================
  // 4. PURCHASE PAYMENTS
  // ==========================================

  async createPurchasePayment(dto: CreatePurchasePaymentDto, userParam: any) {
    const { userId, instituteId } = extractUserContext(userParam);
    const invoice = await this.getPurchaseInvoiceById(dto.purchaseInvoiceId, userParam);
    if (invoice.status !== InvoiceStatus.POSTED) {
      throw new BadRequestException('Payments can only be created for POSTED purchase invoices.');
    }

    const totalPaid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const outstanding = Number(invoice.grandTotal) - totalPaid;

    if (dto.amount > outstanding) {
      throw new BadRequestException(`Payment amount (${dto.amount}) exceeds outstanding invoice amount (${outstanding.toFixed(2)}).`);
    }

    const paymentNumber = await this.numberingService.generateNextNumber(DocumentType.PAYMENT);

    const payment = await this.prisma.$transaction(async (tx) => {
      const newPayment = await tx.purchasePayment.create({
        data: {
          paymentNumber,
          instituteId,
          purchaseInvoiceId: dto.purchaseInvoiceId,
          paymentDate: new Date(dto.paymentDate),
          amount: dto.amount,
          mode: dto.mode,
          referenceNo: dto.referenceNo,
          createdBy: userId!,
        },
      });

      const newTotalPaid = totalPaid + dto.amount;
      let newPaymentStatus: PaymentStatus = PaymentStatus.PARTIALLY_PAID;
      if (Math.abs(newTotalPaid - Number(invoice.grandTotal)) < 0.01) {
        newPaymentStatus = PaymentStatus.PAID;
      }

      await tx.purchaseInvoice.update({
        where: { id: dto.purchaseInvoiceId },
        data: { paymentStatus: newPaymentStatus },
      });

      return newPayment;
    });

    await this.auditService.log({
      userId,
      entityType: 'PURCHASE_PAYMENT',
      entityId: payment.id,
      action: 'PAYMENT',
      metadata: { invoiceId: dto.purchaseInvoiceId, amount: dto.amount, instituteId },
    });

    return payment;
  }

  async getPurchasePayments(query: PaginationQueryDto, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const { page = 1, limit = 25 } = query;
    const skip = (page - 1) * limit;

    const where = scopeWhere({}, instituteId);

    const [payments, total] = await Promise.all([
      this.prisma.purchasePayment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          paymentNumber: true,
          paymentDate: true,
          amount: true,
          mode: true,
          referenceNo: true,
          createdAt: true,
          purchaseInvoice: {
            select: {
              id: true,
              invoiceNumber: true,
              vendorInvoiceNumber: true,
              vendor: { select: { id: true, vendorCode: true, vendorName: true } },
            },
          },
          creator: { select: { id: true, name: true } },
        },
      }),
      this.prisma.purchasePayment.count({ where }),
    ]);

    return {
      data: payments,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getInvoicePayments(purchaseInvoiceId: string, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const where = scopeWhere({ purchaseInvoiceId }, instituteId);
    return this.prisma.purchasePayment.findMany({
      where,
      orderBy: { paymentDate: 'desc' },
    });
  }

  async updatePo(id: string, dto: UpdatePurchaseOrderDto, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const po = await this.getPoById(id, userParam);
    if (po.status !== PoStatus.DRAFT) {
      throw new BadRequestException(`Cannot update Purchase Order in status ${po.status}. Must be DRAFT.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let subtotal = Number(po.subtotal);
      let taxAmount = Number(po.taxAmount);
      const discount = dto.discount !== undefined ? dto.discount : Number(po.discount);

      if (dto.items && dto.items.length > 0) {
        await tx.purchaseOrderItem.deleteMany({ where: { poId: id } });

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
            poId: id,
            itemId: itemDto.itemId,
            quantity: itemDto.quantity,
            unitPrice: itemDto.unitPrice,
            taxCodeId: itemDto.taxCodeId,
            lineTotal: calc.lineTotal,
          });
        }

        await tx.purchaseOrderItem.createMany({ data: itemsData });
      }

      const grandTotal = Number((subtotal + taxAmount - discount).toFixed(2));

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          vendorId: dto.vendorId || undefined,
          warehouseId: dto.warehouseId || undefined,
          expectedDeliveryDate: dto.expectedDeliveryDate ? new Date(dto.expectedDeliveryDate) : undefined,
          discount,
          subtotal,
          taxAmount,
          grandTotal,
        },
        include: {
          vendor: true,
          warehouse: true,
          items: { include: { item: true, taxCode: true } },
        },
      });
    });

    await this.auditService.log({
      userId,
      entityType: 'PURCHASE_ORDER',
      entityId: id,
      action: 'UPDATE',
      newStatus: po.status,
    });

    return updated;
  }

  async deletePo(id: string, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const po = await this.getPoById(id, userParam);
    if (po.status !== PoStatus.DRAFT) {
      throw new BadRequestException(`Cannot delete Purchase Order in status ${po.status}. Must be DRAFT.`);
    }

    await this.prisma.purchaseOrder.delete({ where: { id } });

    await this.auditService.log({
      userId,
      entityType: 'PURCHASE_ORDER',
      entityId: id,
      action: 'DELETE',
      oldStatus: po.status,
    });

    return { message: `Purchase Order ${po.poNumber} deleted successfully.` };
  }

  async updateGrn(id: string, dto: UpdateGrnDto, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const grn = await this.getGrnById(id, userParam);
    if (grn.status !== GrnStatus.DRAFT) {
      throw new BadRequestException(`Cannot update GRN in status ${grn.status}. Must be DRAFT.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.items && dto.items.length > 0) {
        await tx.grnItem.deleteMany({ where: { grnId: id } });
        const itemsData = dto.items.map((i) => ({
          grnId: id,
          poItemId: i.poItemId,
          itemId: i.itemId,
          receivedQty: i.receivedQty,
          acceptedQty: i.acceptedQty,
          rejectedQty: i.rejectedQty,
        }));
        await tx.grnItem.createMany({ data: itemsData });
      }

      return tx.goodsReceiptNote.update({
        where: { id },
        data: {
          receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : undefined,
          warehouseId: dto.warehouseId || undefined,
        },
        include: {
          po: true,
          vendor: true,
          warehouse: true,
          items: { include: { item: true } },
        },
      });
    });

    await this.auditService.log({
      userId,
      entityType: 'GRN',
      entityId: id,
      action: 'UPDATE',
      newStatus: grn.status,
    });

    return updated;
  }

  async deleteGrn(id: string, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const grn = await this.getGrnById(id, userParam);
    if (grn.status !== GrnStatus.DRAFT) {
      throw new BadRequestException(`Cannot delete GRN in status ${grn.status}. Must be DRAFT.`);
    }

    await this.prisma.goodsReceiptNote.delete({ where: { id } });

    await this.auditService.log({
      userId,
      entityType: 'GRN',
      entityId: id,
      action: 'DELETE',
      oldStatus: grn.status,
    });

    return { message: `GRN ${grn.grnNumber} deleted successfully.` };
  }

  async updatePurchaseInvoice(id: string, dto: UpdatePurchaseInvoiceDto, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const invoice = await this.getPurchaseInvoiceById(id, userParam);
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(`Cannot update Purchase Invoice in status ${invoice.status}. Must be DRAFT.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let subtotal = Number(invoice.subtotal);
      let taxAmount = Number(invoice.taxAmount);
      const discount = dto.discount !== undefined ? dto.discount : Number(invoice.discount);

      if (dto.items && dto.items.length > 0) {
        await tx.purchaseInvoiceItem.deleteMany({ where: { purchaseInvoiceId: id } });

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
            purchaseInvoiceId: id,
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

        await tx.purchaseInvoiceItem.createMany({ data: itemsData });
      }

      const grandTotal = Number((subtotal + taxAmount - discount).toFixed(2));

      return tx.purchaseInvoice.update({
        where: { id },
        data: {
          vendorInvoiceNumber: dto.vendorInvoiceNumber || undefined,
          vendorId: dto.vendorId || undefined,
          poId: dto.poId || undefined,
          grnId: dto.grnId || undefined,
          invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined,
          discount,
          subtotal,
          taxAmount,
          grandTotal,
        },
        include: {
          vendor: true,
          po: true,
          grn: true,
          items: { include: { item: true, taxCode: true } },
        },
      });
    });

    await this.auditService.log({
      userId,
      entityType: 'PURCHASE_INVOICE',
      entityId: id,
      action: 'UPDATE',
      newStatus: invoice.status,
    });

    return updated;
  }

  async deletePurchaseInvoice(id: string, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const invoice = await this.getPurchaseInvoiceById(id, userParam);
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(`Cannot delete Purchase Invoice in status ${invoice.status}. Must be DRAFT.`);
    }

    await this.prisma.purchaseInvoice.delete({ where: { id } });

    await this.auditService.log({
      userId,
      entityType: 'PURCHASE_INVOICE',
      entityId: id,
      action: 'DELETE',
      oldStatus: invoice.status,
    });

    return { message: `Purchase Invoice ${invoice.invoiceNumber} deleted successfully.` };
  }

  async getPurchasePaymentById(id: string, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const where = scopeWhere({ id }, instituteId);
    const payment = await this.prisma.purchasePayment.findFirst({
      where,
      include: {
        purchaseInvoice: { include: { vendor: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });
    if (!payment) throw new NotFoundException('Purchase Payment not found.');
    return payment;
  }

  async updatePurchasePayment(id: string, dto: UpdatePurchasePaymentDto, userParam: any) {
    const payment = await this.getPurchasePaymentById(id, userParam);
    const updated = await this.prisma.purchasePayment.update({
      where: { id },
      data: {
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
        amount: dto.amount !== undefined ? dto.amount : undefined,
        mode: dto.mode || undefined,
        referenceNo: dto.referenceNo !== undefined ? dto.referenceNo : undefined,
      },
    });

    if (dto.amount !== undefined && dto.amount !== Number(payment.amount)) {
      const invoice = await this.getPurchaseInvoiceById(payment.purchaseInvoiceId, userParam);
      const totalPayments = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      let newPaymentStatus: PaymentStatus = PaymentStatus.PARTIALLY_PAID;
      if (Math.abs(totalPayments - Number(invoice.grandTotal)) < 0.01) {
        newPaymentStatus = PaymentStatus.PAID;
      } else if (totalPayments <= 0) {
        newPaymentStatus = PaymentStatus.UNPAID;
      }

      await this.prisma.purchaseInvoice.update({
        where: { id: payment.purchaseInvoiceId },
        data: { paymentStatus: newPaymentStatus },
      });
    }

    return updated;
  }

  async deletePurchasePayment(id: string, userParam: any) {
    const { userId } = extractUserContext(userParam);
    const payment = await this.getPurchasePaymentById(id, userParam);
    const invoiceId = payment.purchaseInvoiceId;

    await this.prisma.$transaction(async (tx) => {
      await tx.purchasePayment.delete({ where: { id } });

      const remainingPayments = await tx.purchasePayment.findMany({ where: { purchaseInvoiceId: invoiceId } });
      const invoice = await tx.purchaseInvoice.findUnique({ where: { id: invoiceId } });

      if (invoice) {
        const total = remainingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        let newStatus: PaymentStatus = PaymentStatus.UNPAID;
        if (total > 0) {
          newStatus = Math.abs(total - Number(invoice.grandTotal)) < 0.01 ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID;
        }

        await tx.purchaseInvoice.update({
          where: { id: invoiceId },
          data: { paymentStatus: newStatus },
        });
      }
    });

    await this.auditService.log({
      userId,
      entityType: 'PURCHASE_PAYMENT',
      entityId: id,
      action: 'DELETE',
      metadata: { paymentNumber: payment.paymentNumber },
    });

    return { message: `Purchase Payment ${payment.paymentNumber} deleted successfully.` };
  }

  async voidPurchasePayment(id: string, userParam: any) {
    return this.deletePurchasePayment(id, userParam);
  }
}
