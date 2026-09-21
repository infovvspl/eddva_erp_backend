import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignHostelUserToRoleDto {
  @ApiProperty({
    example: 'usr_hostel_001',
    description: 'EDDVA employee/user identifier',
  })
  @IsString()
  @IsNotEmpty()
  eddva_user_id: string;

  @ApiProperty({ example: 'Riya Warden' })
  @IsString()
  @IsNotEmpty()
  user_name: string;

  @ApiPropertyOptional({ example: 'riya@school.edu' })
  @IsOptional()
  @IsEmail()
  user_email?: string;

  @ApiProperty({
    example: 'warden_riya',
    description: 'Username for direct Hostel login',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    example: 'Hostel#2026',
    description: 'Initial login password',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({
    example: 1,
    description: 'Role ID created via POST /api/hostel/roles',
  })
  @IsInt()
  role_id: number;
}
