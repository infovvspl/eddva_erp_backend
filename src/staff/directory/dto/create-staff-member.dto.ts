import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum StaffTypeDto {
  teaching = 'teaching',
  non_teaching = 'non_teaching',
}

export class CreateStaffMemberDto {
  @ApiProperty({ example: 'Aarav Mehta' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  full_name: string;

  @ApiProperty({ enum: StaffTypeDto, example: StaffTypeDto.teaching })
  @IsEnum(StaffTypeDto)
  staff_type: StaffTypeDto;

  @ApiProperty({ example: 1, description: 'StaffDepartment id' })
  @IsInt()
  department_id: number;

  @ApiProperty({ example: 'Mathematics Teacher' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  designation: string;

  @ApiPropertyOptional({ example: 'permanent' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  employment_type?: string;

  @ApiPropertyOptional({ example: 'aarav.mehta@school.edu' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+91 90000 00000' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  date_of_joining: string;

  @ApiPropertyOptional({
    example: 3,
    description: 'staff_id of the reporting manager (e.g. Department Head/Principal)',
  })
  @IsOptional()
  @IsInt()
  reporting_to_id?: number;
}
