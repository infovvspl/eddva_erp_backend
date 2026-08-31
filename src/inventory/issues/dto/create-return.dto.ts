import { IsDateString, IsEnum, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum ReturnConditionDto {
  good = 'good',
  damaged = 'damaged',
  unusable = 'unusable',
}

export class CreateReturnDto {
  @ApiPropertyOptional({ example: 3, description: 'Ignored for assets (always the full quantity of 1); required for consumables' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity_returned?: number;

  @ApiProperty({ enum: ReturnConditionDto, example: ReturnConditionDto.good })
  @IsEnum(ReturnConditionDto)
  condition: ReturnConditionDto;

  @ApiPropertyOptional({ example: 'Minor scuff on the casing' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional({ example: '2026-09-10', description: 'Defaults to today if omitted' })
  @IsOptional()
  @IsDateString()
  return_date?: string;
}
