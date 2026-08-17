import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AssignUserCanteenRoleDto {
  @ApiProperty({ example: 'role-uuid-here' })
  @IsNotEmpty()
  @IsString()
  roleId: string;
}
