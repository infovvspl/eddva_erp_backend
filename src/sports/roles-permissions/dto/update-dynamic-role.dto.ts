import { PartialType } from '@nestjs/swagger';
import { CreateSportsDynamicRoleDto } from './create-dynamic-role.dto';
export class UpdateSportsDynamicRoleDto extends PartialType(CreateSportsDynamicRoleDto) {}
