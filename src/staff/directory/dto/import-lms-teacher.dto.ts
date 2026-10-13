import { IsDateString, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportLmsTeacherDto {
  @ApiProperty({ example: 'a9c84dcf-7112-400c-a3d2-b0bcf2decc74', description: 'The LMS teacher id (teacherId from GET /api/staff/lms-teachers)' })
  @IsString()
  @IsNotEmpty()
  teacher_id: string;

  @ApiProperty({ example: 'EDTECH-2026-001', description: "The LMS teacher's employee_id — becomes this staff member's staff_code" })
  @IsString()
  @IsNotEmpty()
  employee_id: string;

  @ApiProperty({ example: 'Aarav Mehta' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  full_name: string;

  @ApiProperty({ example: 'aarav.mehta@school.edu' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 1, description: 'StaffDepartment id — can be assigned later' })
  @IsOptional()
  @IsInt()
  department_id?: number;

  @ApiPropertyOptional({ example: 'Mathematics Teacher', description: 'Defaults to "Teacher" when the LMS has none on file' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  designation?: string;

  @ApiPropertyOptional({ example: '2024-06-01', description: "Defaults to today's date when the LMS has none on file" })
  @IsOptional()
  @IsDateString()
  date_of_joining?: string;
}
