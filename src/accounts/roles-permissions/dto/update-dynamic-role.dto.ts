import { PartialType } from '@nestjs/swagger';
import { CreateAccountsDynamicRoleDto } from './create-dynamic-role.dto';

export class UpdateAccountsDynamicRoleDto extends PartialType(CreateAccountsDynamicRoleDto) {}
