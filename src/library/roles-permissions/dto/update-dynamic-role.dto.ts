import { PartialType } from '@nestjs/swagger';
import { CreateDynamicRoleDto } from './create-dynamic-role.dto';
export class UpdateDynamicRoleDto extends PartialType(CreateDynamicRoleDto) {}
