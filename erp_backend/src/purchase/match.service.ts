import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

import { extractUserContext, scopeWhere } from '../common/utils/institute-scope.util';

export interface MismatchDetail {
  type: 'QUANTITY' | 'PRICE' | 'ITEM_NOT_FOUND' | 'TAX';
  itemId: string;
  poQuantity?: number;
  receivedQuantity?: number;
  invoiceQuantity?: number;
  poUnitPrice?: number;
  invoiceUnitPrice?: number;
  difference?: number;
  message: string;
}

export interface MatchResult {
  matched: boolean;
  mismatches: MismatchDetail[];
}

@Injectable()
export class MatchService {
  constructor(private prisma: PrismaService) {}

  /**
   * Run 3-Way Matching comparison across PO, GRN, and Purchase Invoice.
   */
  async matchPurchaseInvoice(purchaseInvoiceId: string, userParam?: any): Promise<MatchResult> {
    const { instituteId } = extractUserContext(userParam);
    const where = scopeWhere({ id: purchaseInvoiceId }, instituteId);

    const invoice = await this.prisma.purchaseInvoice.findFirst({
      where,
      include: {
        items: { include: { item: true, taxCode: true } },
        po: { include: { items: true } },
        grn: { include: { items: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found.');
    }

    const mismatches: MismatchDetail[] = [];

    // If linked to PO, compare items and quantities/prices
    if (invoice.po) {
      const poItemsMap = new Map(invoice.po.items.map((pi) => [pi.itemId, pi]));
      const grnItemsMap = invoice.grn
        ? new Map(invoice.grn.items.map((gi) => [gi.itemId, gi]))
        : null;

      for (const invItem of invoice.items) {
        const poItem = poItemsMap.get(invItem.itemId);

        if (!poItem) {
          mismatches.push({
            type: 'ITEM_NOT_FOUND',
            itemId: invItem.itemId,
            message: `Item ${invItem.item.itemName} (${invItem.item.itemCode}) is not present on the linked Purchase Order ${invoice.po.poNumber}.`,
          });
          continue;
        }

        // 1. Price Matching
        const poPrice = Number(poItem.unitPrice);
        const invPrice = Number(invItem.unitPrice);
        if (Math.abs(poPrice - invPrice) > 0.01) {
          mismatches.push({
            type: 'PRICE',
            itemId: invItem.itemId,
            poUnitPrice: poPrice,
            invoiceUnitPrice: invPrice,
            difference: Number((invPrice - poPrice).toFixed(2)),
            message: `Unit price mismatch for ${invItem.item.itemName}. PO price: ${poPrice}, Invoice price: ${invPrice}.`,
          });
        }

        // 2. Quantity Matching (3-Way: PO vs GRN vs Invoice)
        const invQty = Number(invItem.quantity);
        const poQty = Number(poItem.quantity);

        if (grnItemsMap) {
          const grnItem = grnItemsMap.get(invItem.itemId);
          const acceptedQty = grnItem ? Number(grnItem.acceptedQty) : 0;

          if (invQty > acceptedQty) {
            mismatches.push({
              type: 'QUANTITY',
              itemId: invItem.itemId,
              poQuantity: poQty,
              receivedQuantity: acceptedQty,
              invoiceQuantity: invQty,
              difference: Number((invQty - acceptedQty).toFixed(2)),
              message: `Invoice quantity (${invQty}) exceeds GRN accepted quantity (${acceptedQty}) for item ${invItem.item.itemName}.`,
            });
          }
        } else {
          // If GRN is not directly attached, check against PO total quantity
          if (invQty > poQty) {
            mismatches.push({
              type: 'QUANTITY',
              itemId: invItem.itemId,
              poQuantity: poQty,
              invoiceQuantity: invQty,
              difference: Number((invQty - poQty).toFixed(2)),
              message: `Invoice quantity (${invQty}) exceeds PO quantity (${poQty}) for item ${invItem.item.itemName}.`,
            });
          }
        }
      }
    }

    return {
      matched: mismatches.length === 0,
      mismatches,
    };
  }
}
