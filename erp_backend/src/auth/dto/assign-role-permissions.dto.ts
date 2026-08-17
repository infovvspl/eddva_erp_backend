import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class AssignRolePermissionsDto {
  @ApiProperty({
    type: [String],
    example: ['perm-uuid-1', 'perm-uuid-2'],
    description: 'Array of permission UUIDs to assign to the role',
  })
  @IsArray({ message: 'permissionIds must be an array' })
  @IsString({ each: true, message: 'Each permissionId must be a string' })
  permissionIds: string[];
}
