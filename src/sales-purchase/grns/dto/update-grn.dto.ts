import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateGrnDto } from './create-grn.dto';

/** A GRN can only be edited while DRAFT (module spec §23/§64); purchase_order_id is immutable once created. */
export class UpdateGrnDto extends PartialType(
  OmitType(CreateGrnDto, ['purchase_order_id'] as const),
) {}
