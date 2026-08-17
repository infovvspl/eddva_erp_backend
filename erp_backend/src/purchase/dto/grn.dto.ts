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

export class CreateGrnItemDto {
  @ApiProperty({ example: 'po-item-uuid' })
  @IsUUID()
  @IsNotEmpty()
  poItemId: string;

  @ApiProperty({ example: 'item-uuid' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(0)
  receivedQty: number;

  @ApiProperty({ example: 9 })
  @IsNumber()
  @Min(0)
  acceptedQty: number;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(0)
  rejectedQty: number;
}

export class CreateGrnDto {
  @ApiProperty({ example: 'po-uuid' })
  @IsUUID()
  @IsNotEmpty()
  poId: string;

  @ApiProperty({ example: 'vendor-uuid' })
  @IsUUID()
  @IsNotEmpty()
  vendorId: string;

  @ApiProperty({ example: '2026-08-12T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  receivedDate: Date;

  @ApiProperty({ example: 'warehouse-uuid' })
  @IsUUID()
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ type: [CreateGrnItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGrnItemDto)
  items: CreateGrnItemDto[];
}

export class UpdateGrnDto extends PartialType(CreateGrnDto) {}
