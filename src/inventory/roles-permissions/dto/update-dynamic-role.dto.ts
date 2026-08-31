import { PartialType } from '@nestjs/swagger';
import { CreateInventoryDynamicRoleDto } from './create-dynamic-role.dto';

export class UpdateInventoryDynamicRoleDto extends PartialType(CreateInventoryDynamicRoleDto) {}
