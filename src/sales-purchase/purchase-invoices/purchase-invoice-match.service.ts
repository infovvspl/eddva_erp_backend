import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessException } from '../common/business-exception';

export interface MatchLineInput {
  item_id: number;
  po_item_id?: number;
  grn_item_id?: number;
  quantity: number;
  unit_price: number;
}

/**
 * Three-way match (module spec §26): a purchase invoice line linked to a PO
 * and/or GRN must reconcile quantity and price against them before posting.
 * - Price: invoice unit_price must exactly equal the approved PO line price
 *   (no drift tolerance by default — the PO price was already approved).
 * - Quantity vs PO: cumulative invoiced quantity (this invoice + all other
 *   non-cancelled invoices already posted/drafted against the same PO item)
 *   must not exceed the ordered quantity.
 * - Quantity vs GRN: cumulative invoiced quantity against a given GRN item
 *   must not exceed its accepted_qty — goods that were received but
 *   rejected, or never received at all, can never be invoiced.
 * Runs inside the same transaction as posting so the check and the write
 * are atomic.
 */
@Injectable()
export class PurchaseInvoiceMatchService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(
    tx: PrismaService | any,
    excludeInvoiceId: number,
    lines: MatchLineInput[],
  ) {
    const client = tx ?? this.prisma;

    for (const line of lines) {
      if (line.po_item_id) {
        const poItem = await client.spPurchaseOrderItem.findUnique({
          where: { po_item_id: line.po_item_id },
        });
        if (!poItem)
          throw new NotFoundException(`PO item #${line.po_item_id} not found`);

        if (Number(poItem.unit_price) !== Number(line.unit_price)) {
          throw new BusinessException(
            'PURCHASE_INVOICE_THREE_WAY_MATCH_FAILED',
            `Invoice unit price for item #${line.item_id} does not match the approved purchase order price.`,
            {
              itemId: line.item_id,
              poItemId: line.po_item_id,
              orderedPrice: Number(poItem.unit_price),
              invoicedPrice: line.unit_price,
            },
          );
        }

        const alreadyInvoiced = await client.spPurchaseInvoiceItem.aggregate({
          where: {
            po_item_id: line.po_item_id,
            pi_id: { not: excludeInvoiceId },
            invoice: { status: { not: 'CANCELLED' } },
          },
          _sum: { quantity: true },
        });
        const invoicedSoFar = Number(alreadyInvoiced._sum.quantity ?? 0);
        const totalInvoiced = invoicedSoFar + line.quantity;
        if (totalInvoiced > Number(poItem.quantity)) {
          throw new BusinessException(
            'PURCHASE_INVOICE_THREE_WAY_MATCH_FAILED',
            `Purchase invoice cannot be posted because the invoiced quantity exceeds the ordered quantity.`,
            {
              itemId: line.item_id,
              orderedQuantity: Number(poItem.quantity),
              receivedQuantity: Number(poItem.received_qty),
              invoicedQuantity: totalInvoiced,
            },
          );
        }
      }

      if (line.grn_item_id) {
        const grnItem = await client.spGrnItem.findUnique({
          where: { grn_item_id: line.grn_item_id },
        });
        if (!grnItem)
          throw new NotFoundException(
            `GRN item #${line.grn_item_id} not found`,
          );

        const alreadyInvoiced = await client.spPurchaseInvoiceItem.aggregate({
          where: {
            grn_item_id: line.grn_item_id,
            pi_id: { not: excludeInvoiceId },
            invoice: { status: { not: 'CANCELLED' } },
          },
          _sum: { quantity: true },
        });
        const invoicedSoFar = Number(alreadyInvoiced._sum.quantity ?? 0);
        const totalInvoiced = invoicedSoFar + line.quantity;
        if (totalInvoiced > Number(grnItem.accepted_qty)) {
          throw new BusinessException(
            'PURCHASE_INVOICE_THREE_WAY_MATCH_FAILED',
            `Purchase invoice cannot be posted because the invoiced quantity exceeds the goods actually received and accepted.`,
            {
              itemId: line.item_id,
              orderedQuantity: Number(grnItem.received_qty),
              receivedQuantity: Number(grnItem.accepted_qty),
              invoicedQuantity: totalInvoiced,
            },
          );
        }
      }
    }
  }
}
