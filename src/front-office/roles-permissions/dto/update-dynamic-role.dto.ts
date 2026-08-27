import { PartialType } from '@nestjs/swagger';
import { CreateFrontOfficeDynamicRoleDto } from './create-dynamic-role.dto';

export class UpdateFrontOfficeDynamicRoleDto extends PartialType(CreateFrontOfficeDynamicRoleDto) {}
