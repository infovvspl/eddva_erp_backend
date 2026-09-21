import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateHostelCustomPermissionDto {
  @ApiProperty({ example: 'gate_passes', description: 'Target resource key' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({ example: 'export', description: 'Action key' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiProperty({ example: 'Export Gate Passes' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Gate Passes' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'Allows exporting gate pass records' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateHostelCustomPermissionDto extends PartialType(
  CreateHostelCustomPermissionDto,
) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
