import { PartialType } from '@nestjs/swagger';
import { CreateSalesPurchaseDynamicRoleDto } from './create-dynamic-role.dto';

export class UpdateSalesPurchaseDynamicRoleDto extends PartialType(
  CreateSalesPurchaseDynamicRoleDto,
) {}
