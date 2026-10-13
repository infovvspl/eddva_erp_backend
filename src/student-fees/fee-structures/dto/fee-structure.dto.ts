import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const MAX_AMOUNT = 99_999_999.99;

export class CreateFeeStructureDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  class_id: number;

  @ApiProperty({ example: 'Term 1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  term_name: string;

  @ApiProperty({ example: 15000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  amount: number;

  @ApiProperty({ example: '2026-06-30' })
  @IsDateString()
  due_date: string;

  @ApiProperty({ example: '2026-27' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  academic_year: string;
}

export class UpdateFeeStructureDto {
  @ApiPropertyOptional({ example: 16000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  amount?: number;

  @ApiPropertyOptional({ example: '2026-07-15' })
  @IsOptional()
  @IsDateString()
  due_date?: string;
}

export class QueryFeeStructureDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  class_id?: number;

  @ApiPropertyOptional({ example: '2026-27' })
  @IsOptional()
  @IsString()
  academic_year?: string;
}
