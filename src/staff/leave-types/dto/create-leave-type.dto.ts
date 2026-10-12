import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StaffTypeDto } from '../../directory/dto/create-staff-member.dto';

export class CreateLeaveTypeDto {
  @ApiProperty({ example: 'Casual Leave' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'CL', description: 'Short unique code for this institute' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;

  @ApiPropertyOptional({
    enum: StaffTypeDto,
    description: 'Leave omitted for a leave type that applies to both teaching and non-teaching staff',
  })
  @IsOptional()
  @IsEnum(StaffTypeDto)
  applicable_staff_type?: StaffTypeDto;

  @ApiProperty({ example: 12, description: 'Days credited per calendar year' })
  @IsNumber()
  @Min(0)
  @Max(365)
  annual_quota_days: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  is_paid?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  allow_carry_forward?: boolean;

  @ApiPropertyOptional({ example: 5, description: 'Cap on days carried into the next year; omit for no cap' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  max_carry_forward_days?: number;
}
