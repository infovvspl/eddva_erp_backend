import { IsBoolean, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateApprovalRuleDto {
  @ApiPropertyOptional({ example: 1, description: 'Omit for a global rule applying to all categories' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  category_id?: number;

  @ApiPropertyOptional({ example: 10000, description: 'Issue is held for approval once quantity * last purchase price reaches this value' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value_threshold?: number;

  @ApiPropertyOptional({ example: 50, description: 'Issue is held for approval once the requested quantity reaches this count' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity_threshold?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
