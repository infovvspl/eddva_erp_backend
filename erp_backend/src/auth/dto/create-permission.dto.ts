import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsUUID, Matches } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({
    example: 'sales.discount.approve',
    description: 'Unique key for permission (e.g. sales.discount.approve)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9_\-\.]+$/i, {
    message:
      'permissionKey must contain only letters, numbers, dots, hyphens, or underscores (e.g. sales.discount.approve)',
  })
  permissionKey: string;

  @ApiProperty({
    example: 'Approve sales discounts for customers',
    description: 'Detailed description of what this permission allows',
  })
  @IsString()
  @IsNotEmpty()
  description: string;
}
