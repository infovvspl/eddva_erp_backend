import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateSportsCustomPermissionDto {
  @ApiProperty({ example: 'houses', description: 'Target resource key' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({ example: 'export', description: 'Action key' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiProperty({ example: 'Export House Leaderboard' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'House Management' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'Allows exporting house standings leaderboard' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateSportsCustomPermissionDto extends PartialType(CreateSportsCustomPermissionDto) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
