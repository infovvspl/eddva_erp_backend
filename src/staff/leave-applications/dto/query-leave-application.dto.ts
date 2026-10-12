import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum LeaveApplicationStatusDto {
  pending = 'pending',
  approved = 'approved',
  rejected = 'rejected',
  cancelled = 'cancelled',
}

export class QueryLeaveApplicationDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  staff_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  leave_type_id?: number;

  @ApiPropertyOptional({ enum: LeaveApplicationStatusDto })
  @IsOptional()
  @IsEnum(LeaveApplicationStatusDto)
  status?: LeaveApplicationStatusDto;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}
