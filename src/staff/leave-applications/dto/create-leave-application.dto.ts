import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLeaveApplicationDto {
  @ApiProperty({ example: 1, description: 'staff_id this leave is being filed for' })
  @IsInt()
  staff_id: number;

  @ApiProperty({ example: 1, description: 'LeaveType id' })
  @IsInt()
  leave_type_id: number;

  @ApiProperty({ example: '2026-11-10' })
  @IsDateString()
  from_date: string;

  @ApiProperty({ example: '2026-11-12' })
  @IsDateString()
  to_date: string;

  @ApiPropertyOptional({ example: false, description: 'Only valid when from_date equals to_date — counts as 0.5 day instead of 1' })
  @IsOptional()
  @IsBoolean()
  is_half_day?: boolean;

  @ApiPropertyOptional({ example: 'AM', enum: ['AM', 'PM'], description: 'Which half of the day; only used when is_half_day is true' })
  @IsOptional()
  @IsIn(['AM', 'PM'])
  half_day_period?: 'AM' | 'PM';

  @ApiPropertyOptional({ example: 'Family function' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
