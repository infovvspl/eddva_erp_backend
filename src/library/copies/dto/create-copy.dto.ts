import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum CopyCondition {
  new = 'new',
  good = 'good',
  worn = 'worn',
  damaged = 'damaged',
}

export class CreateCopyDto {
  @ApiProperty({ example: 'BC-001-2024', description: 'Unique barcode printed on the copy' })
  @IsString()
  @IsNotEmpty()
  barcode: string;

  @ApiPropertyOptional({ example: 'Shelf A-3' })
  @IsOptional()
  @IsString()
  rack_location?: string;

  @ApiPropertyOptional({ enum: CopyCondition, default: 'new' })
  @IsOptional()
  @IsEnum(CopyCondition)
  condition?: CopyCondition;

  @ApiPropertyOptional({ example: '2024-01-15' })
  @IsOptional()
  @IsDateString()
  acquired_date?: string;

  @ApiPropertyOptional({ example: 450.00 })
  @IsOptional()
  @Type(() => Number)
  price?: number;
}
