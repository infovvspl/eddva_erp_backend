import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePurchaseOrderItemDto {
  @ApiProperty({ example: 'item-uuid' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiProperty({ example: 500.0 })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiProperty({ example: 'taxcode-uuid' })
  @IsUUID()
  @IsNotEmpty()
  taxCodeId: string;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ example: 'vendor-uuid' })
  @IsUUID()
  @IsNotEmpty()
  vendorId: string;

  @ApiProperty({ example: '2026-08-11T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  poDate: Date;

  @ApiProperty({ example: '2026-08-25T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  expectedDeliveryDate: Date;

  @ApiProperty({ example: 'warehouse-uuid' })
  @IsUUID()
  @IsNotEmpty()
  warehouseId: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiProperty({ type: [CreatePurchaseOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items: CreatePurchaseOrderItemDto[];
}

export class UpdatePurchaseOrderDto extends PartialType(CreatePurchaseOrderDto) {}

export class ApprovalActionDto {
  @ApiPropertyOptional({ example: 'Approved after price verification' })
  @IsOptional()
  @IsString()
  remarks?: string;
}
