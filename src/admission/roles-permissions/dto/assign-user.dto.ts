import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignAdmissionUserToRoleDto {
  @ApiProperty({
    example: 'usr_admission_001',
    description: 'EDDVA employee/user identifier',
  })
  @IsString()
  @IsNotEmpty()
  eddva_user_id: string;

  @ApiProperty({ example: 'Riya Admission Officer' })
  @IsString()
  @IsNotEmpty()
  user_name: string;

  @ApiPropertyOptional({ example: 'riya@school.edu' })
  @IsOptional()
  @IsEmail()
  user_email?: string;

  @ApiProperty({
    example: 'admission_officer_riya',
    description: 'Username for direct Admission login',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    example: 'Admission#2026',
    description: 'Initial login password',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({
    example: 1,
    description: 'Role ID created via POST /api/admission/roles',
  })
  @IsInt()
  role_id: number;
}
