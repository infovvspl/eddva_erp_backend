import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID } from 'class-validator';

export class UpdatePermissionDto {
  @ApiPropertyOptional({
    example: 'Approve special prices and discounts',
    description: 'Updated permission description',
  })
  @IsString()
  @IsOptional()
  description?: string;
}
