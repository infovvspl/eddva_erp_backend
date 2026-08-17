import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateItemDto {
  @ApiProperty({ example: 'ITEM-001' })
  @IsString()
  @IsNotEmpty()
  itemCode: string;

  @ApiProperty({ example: 'Steel Rod 10mm' })
  @IsString()
  @IsNotEmpty()
  itemName: string;

  @ApiProperty({ example: 'category-uuid' })
  @IsUUID()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty({ example: 'uom-uuid' })
  @IsUUID()
  @IsNotEmpty()
  uomId: string;

  @ApiProperty({ example: 100.0, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  quantity?: number;

  @ApiProperty({ example: '72142090' })
  @IsString()
  @IsNotEmpty()
  hsnSacCode: string;

  @ApiProperty({ example: 450.0 })
  @IsNumber()
  @Min(0)
  purchasePrice: number;

  @ApiProperty({ example: 550.0 })
  @IsNumber()
  @Min(0)
  salesPrice: number;

  @ApiProperty({ example: 'taxcode-uuid' })
  @IsUUID()
  @IsNotEmpty()
  taxCodeId: string;
}
