import { PartialType } from '@nestjs/swagger';
import { CreateCanteenDynamicRoleDto } from './create-dynamic-role.dto';

export class UpdateCanteenDynamicRoleDto extends PartialType(
  CreateCanteenDynamicRoleDto,
) {}
