import { IsDateString, IsInt, IsOptional, IsPositive, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateIssueDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  item_id: number;

  @ApiPropertyOptional({ description: 'Required (and must currently be in_store) when the item is item_type=asset; omit for consumables' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  asset_unit_id?: number;

  @ApiPropertyOptional({ example: 1, default: 1, description: 'Ignored for assets (always 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity?: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  holder_id: number;

  @ApiProperty({ example: 1, description: 'Location the stock/asset is issued from' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  source_location_id: number;

  @ApiProperty({ example: '2026-08-29' })
  @IsDateString()
  issue_date: string;

  @ApiPropertyOptional({ example: '2026-09-15' })
  @IsOptional()
  @IsDateString()
  expected_return_date?: string;
}
