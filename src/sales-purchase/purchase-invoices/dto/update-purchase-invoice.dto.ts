import { PartialType, OmitType } from '@nestjs/swagger';
import { CreatePurchaseInvoiceDto } from './create-purchase-invoice.dto';

/** A purchase invoice can only be edited while DRAFT — posted invoices are immutable (module spec §46). */
export class UpdatePurchaseInvoiceDto extends PartialType(
  OmitType(CreatePurchaseInvoiceDto, ['vendor_id'] as const),
) {}
