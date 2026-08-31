import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum ItemTypeDto {
  consumable = 'consumable',
  asset = 'asset',
}

export class CreateItemDto {
  @ApiProperty({ example: 'ITM-0001', description: 'Unique item code / SKU' })
  @IsString()
  @IsNotEmpty()
  item_code: string;

  @ApiProperty({ example: 'A4 Printer Paper (Ream)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  category_id: number;

  @ApiProperty({ enum: ItemTypeDto, example: ItemTypeDto.consumable })
  @IsEnum(ItemTypeDto)
  item_type: ItemTypeDto;

  @ApiProperty({ example: 'ream' })
  @IsString()
  @IsNotEmpty()
  unit_of_measure: string;

  @ApiPropertyOptional({ example: 20, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorder_level?: number;

  @ApiPropertyOptional({ example: '80 GSM, 500 sheets per ream' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/items/a4-paper.jpg' })
  @IsOptional()
  @IsString()
  image_url?: string;
}
