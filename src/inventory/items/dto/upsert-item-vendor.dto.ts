import { IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpsertItemVendorDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vendor_id: number;

  @ApiPropertyOptional({ example: 250.5 })
  @IsOptional()
  @Type(() => Number)
  last_purchase_price?: number;
}
