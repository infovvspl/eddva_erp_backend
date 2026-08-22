import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum MemberType {
  student = 'student',
  staff = 'staff',
  faculty = 'faculty',
}

export class CreateMembershipRuleDto {
  @ApiProperty({ enum: MemberType })
  @IsEnum(MemberType)
  member_type: MemberType;

  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  max_books_allowed: number;

  @ApiProperty({ example: 14 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  loan_period_days: number;

  @ApiProperty({ example: 2.5, description: 'Fine per overdue day in INR' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fine_per_day: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  grace_period_days?: number;

  @ApiPropertyOptional({ example: 100, description: 'Max fine cap in INR (null = no cap)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  max_fine_cap?: number;
}
