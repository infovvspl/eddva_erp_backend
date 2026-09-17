import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
 *
 * Ownership scoping: every po_item_id/grn_item_id is resolved through a
 * join back to its own sp_purchase_orders/sp_grns row, filtered by the
 * caller's institute_id and (when the invoice itself is linked to a
 * specific PO/GRN) that exact document — never by raw PK alone. Without
 * this, a line could reference another institute's (or another vendor's)
 * PO/GRN item and the match would still "pass".
 *
 * Concurrency: `tx` must be an active database transaction. Each referenced
 * PO/GRN item row is locked with `FOR UPDATE` before its "already invoiced"
 * total is computed, so two invoices racing to match against the same line
 * serialize on that row instead of both reading the same pre-write total
 * and both passing — the same atomic-guard intent as the conditional
 * UPDATEs used elsewhere in this module (GRN receiving, PO/SO quantity
 * tracking), adapted here since there is no single counter column to
 * increment — the "already invoiced" total is a live SUM over sibling rows.
 */
@Injectable()
export class PurchaseInvoiceMatchService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(
    tx: any,
    instituteId: string,
    excludeInvoiceId: number,
    purchaseOrderId: number | undefined,
    grnId: number | undefined,
    lines: MatchLineInput[],
  ) {
    const client = tx ?? this.prisma;

    for (const line of lines) {
      if (line.po_item_id) {
        const poItemRows = (await client.$queryRaw(Prisma.sql`
          SELECT poi.po_item_id, poi.unit_price, poi.quantity, poi.received_qty
          FROM sp_purchase_order_items poi
          JOIN sp_purchase_orders po ON po.po_id = poi.purchase_order_id
          WHERE poi.po_item_id = ${line.po_item_id}
            AND po.institute_id = ${instituteId}
            ${purchaseOrderId ? Prisma.sql`AND po.po_id = ${purchaseOrderId}` : Prisma.empty}
          FOR UPDATE OF poi
        `)) as Array<{
          po_item_id: number;
          unit_price: Prisma.Decimal;
          quantity: Prisma.Decimal;
          received_qty: Prisma.Decimal;
        }>;
        const poItem = poItemRows[0];
        if (!poItem) {
          throw new NotFoundException(
            `PO item #${line.po_item_id} not found${purchaseOrderId ? ` on purchase order #${purchaseOrderId}` : ''}`,
          );
        }

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
        const grnItemRows = (await client.$queryRaw(Prisma.sql`
          SELECT gi.grn_item_id, gi.accepted_qty, gi.received_qty
          FROM sp_grn_items gi
          JOIN sp_grns g ON g.grn_id = gi.grn_id
          WHERE gi.grn_item_id = ${line.grn_item_id}
            AND g.institute_id = ${instituteId}
            ${grnId ? Prisma.sql`AND g.grn_id = ${grnId}` : Prisma.empty}
          FOR UPDATE OF gi
        `)) as Array<{
          grn_item_id: number;
          accepted_qty: Prisma.Decimal;
          received_qty: Prisma.Decimal;
        }>;
        const grnItem = grnItemRows[0];
        if (!grnItem) {
          throw new NotFoundException(
            `GRN item #${line.grn_item_id} not found${grnId ? ` on GRN #${grnId}` : ''}`,
          );
        }

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
