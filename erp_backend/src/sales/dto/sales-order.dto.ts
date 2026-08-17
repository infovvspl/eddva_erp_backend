import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateSalesOrderItemDto {
  @ApiProperty({ example: 'item-uuid' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiProperty({ example: 600.0 })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiProperty({ example: 'taxcode-uuid' })
  @IsUUID()
  @IsNotEmpty()
  taxCodeId: string;
}

export class CreateSalesOrderDto {
  @ApiProperty({ example: 'customer-uuid' })
  @IsUUID()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({ example: '2026-08-11T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  soDate: Date;

  @ApiProperty({ example: '2026-08-20T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  deliveryDate: Date;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiProperty({ type: [CreateSalesOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesOrderItemDto)
  items: CreateSalesOrderItemDto[];
}

export class UpdateSalesOrderDto extends PartialType(CreateSalesOrderDto) {}
