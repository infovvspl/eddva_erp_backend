import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryLeaveBalanceDto {
  @ApiPropertyOptional({ example: 1, description: 'staff_id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  staff_id?: number;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;
}
