import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateSalesInvoiceDto } from './create-sales-invoice.dto';

/** A sales invoice can only be edited while DRAFT — posted invoices are immutable (module spec §46). */
export class UpdateSalesInvoiceDto extends PartialType(
  OmitType(CreateSalesInvoiceDto, ['customer_id'] as const),
) {}
