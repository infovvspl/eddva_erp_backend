import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItemDto {
  @ApiProperty({ example: 'A4 Copier Paper (Ream)' })
  @IsString()
  @IsNotEmpty()
  item_name: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  category_id: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  uom_id: number;

  @ApiPropertyOptional({ example: '4802' })
  @IsOptional()
  @IsString()
  hsn_sac_code?: string;

  @ApiPropertyOptional({ example: 220 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  purchase_price?: number;

  @ApiPropertyOptional({ example: 280 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sales_price?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  tax_code_id?: number;
}
