import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateBookVendorDto {
  @ApiPropertyOptional({ example: 1, description: 'Pick an existing vendor from the master list instead of retyping its details' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vendor_id?: number;

  @ApiPropertyOptional({ example: 'Oxford University Press Distributor', description: 'Vendor/Supplier name' })
  @IsOptional()
  @IsString()
  vendor_name?: string;

  @ApiPropertyOptional({ example: 'Oxford University Press Distributor', description: 'Alias for vendor_name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Vikram Seth' })
  @IsOptional()
  @IsString()
  contact_person?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'orders@oxforddist.in' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: '45 Commercial Complex, New Delhi' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 380.00 })
  @IsOptional()
  @Type(() => Number)
  last_purchase_price?: number;
}
