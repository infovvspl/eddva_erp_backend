import { IsDateString, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
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

  @ApiPropertyOptional({ example: 'Family function' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
