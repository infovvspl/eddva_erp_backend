import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignSportsUserToRoleDto {
  @ApiProperty({ example: 'usr_coach_001', description: 'EDDVA employee/user identifier' })
  @IsString()
  @IsNotEmpty()
  eddva_user_id: string;

  @ApiProperty({ example: 'Coach John Smith' })
  @IsString()
  @IsNotEmpty()
  user_name: string;

  @ApiPropertyOptional({ example: 'john@school.edu' })
  @IsOptional()
  @IsEmail()
  user_email?: string;

  @ApiProperty({ example: 'john_coach', description: 'Username for direct Sports login' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'CoachPass#2026', description: 'Initial login password' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 1, description: 'Role ID created via POST /api/v1/sports/roles' })
  @IsInt()
  role_id: number;
}
