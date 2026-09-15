import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSalesOrderItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  item_id: number;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: 280 })
  @IsNumber()
  @Min(0)
  unit_price: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  tax_code_id?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  line_discount?: number;
}

export class CreateSalesOrderDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  customer_id: number;

  @ApiProperty({ example: '2026-09-15' })
  @IsDateString()
  so_date: string;

  @ApiPropertyOptional({ example: '2026-09-20' })
  @IsOptional()
  @IsDateString()
  delivery_date?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiProperty({ type: [CreateSalesOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesOrderItemDto)
  items: CreateSalesOrderItemDto[];
}
