import { PartialType } from '@nestjs/swagger';
import { CreateAdmissionDynamicRoleDto } from './create-dynamic-role.dto';

export class UpdateAdmissionDynamicRoleDto extends PartialType(
  CreateAdmissionDynamicRoleDto,
) {}
