import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignAlumniUserToRoleDto {
  @ApiProperty({
    example: 'usr_alumni_001',
    description: 'EDDVA employee/user identifier',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(?!alumni-)/i, {
    message:
      'eddva_user_id must not start with "alumni-" (reserved for alumni portal accounts)',
  })
  eddva_user_id: string;

  @ApiProperty({ example: 'Riya Officer' })
  @IsString()
  @IsNotEmpty()
  user_name: string;

  @ApiPropertyOptional({ example: 'riya@school.edu' })
  @IsOptional()
  @IsEmail()
  user_email?: string;

  @ApiProperty({
    example: 'officer_riya',
    description: 'Username for direct Alumni login',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    example: 'Alumni#2026',
    description: 'Initial login password',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({
    example: 1,
    description: 'Role ID created via POST /api/alumni/roles',
  })
  @IsInt()
  role_id: number;
}
