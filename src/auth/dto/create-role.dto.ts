import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'Sales Manager' })
  @IsString()
  @IsNotEmpty()
  roleName: string;

  @ApiPropertyOptional({ example: 'Manages sales orders, customers, and invoices' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: ['perm-uuid-1', 'perm-uuid-2'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];
}
