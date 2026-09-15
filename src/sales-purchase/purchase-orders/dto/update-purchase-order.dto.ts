import { PartialType } from '@nestjs/swagger';
import { CreatePurchaseOrderDto } from './create-purchase-order.dto';

/**
 * A DRAFT PO can be edited freely (lines included — the full `items` array,
 * when supplied, replaces the existing lines). Once a PO leaves DRAFT this
 * DTO is rejected by the service — approved POs follow the amendment
 * workflow described in module spec §20, not a silent PATCH.
 */
export class UpdatePurchaseOrderDto extends PartialType(
  CreatePurchaseOrderDto,
) {}
