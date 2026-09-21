import { PartialType } from '@nestjs/swagger';
import { CreateAlumniDynamicRoleDto } from './create-dynamic-role.dto';

export class UpdateAlumniDynamicRoleDto extends PartialType(
  CreateAlumniDynamicRoleDto,
) {}
