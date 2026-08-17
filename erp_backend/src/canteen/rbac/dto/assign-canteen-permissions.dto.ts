import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class AssignCanteenPermissionsDto {
  @ApiProperty({ example: ['perm-uuid-1', 'perm-uuid-2'] })
  @IsArray()
  @IsString({ each: true })
  permissionIds: string[];
}
