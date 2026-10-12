import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateStaffCustomPermissionDto {
  @ApiProperty({ example: 'staff_members', description: 'Target resource key' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({ example: 'export', description: 'Action key' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiProperty({ example: 'Export Staff Directory' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Staff Directory' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'Allows exporting the staff directory' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateStaffCustomPermissionDto extends PartialType(
  CreateStaffCustomPermissionDto,
) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
