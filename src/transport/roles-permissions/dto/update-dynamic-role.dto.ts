import { PartialType } from '@nestjs/swagger';
import { CreateTransportDynamicRoleDto } from './create-dynamic-role.dto';

export class UpdateTransportDynamicRoleDto extends PartialType(CreateTransportDynamicRoleDto) {}
