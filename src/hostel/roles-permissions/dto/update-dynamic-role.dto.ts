import { PartialType } from '@nestjs/swagger';
import { CreateHostelDynamicRoleDto } from './create-dynamic-role.dto';

export class UpdateHostelDynamicRoleDto extends PartialType(
  CreateHostelDynamicRoleDto,
) {}
