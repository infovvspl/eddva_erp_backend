import { PartialType } from '@nestjs/swagger';
import { CreateStaffDynamicRoleDto } from './create-dynamic-role.dto';

export class UpdateStaffDynamicRoleDto extends PartialType(
  CreateStaffDynamicRoleDto,
) {}
