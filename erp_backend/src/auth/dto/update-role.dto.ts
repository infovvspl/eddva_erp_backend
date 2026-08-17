import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { RoleStatus } from '@prisma/client';

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Senior Sales Manager' })
  @IsString()
  @IsOptional()
  roleName?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: RoleStatus })
  @IsEnum(RoleStatus)
  @IsOptional()
  status?: RoleStatus;

  @ApiPropertyOptional({ example: ['perm-uuid-1', 'perm-uuid-2'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissionIds?: string[];
}
