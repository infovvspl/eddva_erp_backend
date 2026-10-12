import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignStaffUserToRoleDto {
  @ApiProperty({
    example: 'usr_staff_001',
    description: 'EDDVA employee/user identifier',
  })
  @IsString()
  @IsNotEmpty()
  eddva_user_id: string;

  @ApiProperty({ example: 'Amy HR' })
  @IsString()
  @IsNotEmpty()
  user_name: string;

  @ApiPropertyOptional({ example: 'amy@school.edu' })
  @IsOptional()
  @IsEmail()
  user_email?: string;

  @ApiProperty({
    example: 'hr_officer_amy',
    description: 'Username for direct Staff login',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    example: 'Staff#2026',
    description: 'Initial login password',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({
    example: 1,
    description: 'Role ID created via POST /api/staff/roles',
  })
  @IsInt()
  role_id: number;
}
