import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignTransportUserToRoleDto {
  @ApiProperty({ example: 'usr_dispatcher_001', description: 'EDDVA employee/user identifier' })
  @IsString()
  @IsNotEmpty()
  eddva_user_id: string;

  @ApiProperty({ example: 'Asha Dispatcher' })
  @IsString()
  @IsNotEmpty()
  user_name: string;

  @ApiPropertyOptional({ example: 'asha@school.edu' })
  @IsOptional()
  @IsEmail()
  user_email?: string;

  @ApiProperty({ example: 'dispatcher_asha', description: 'Username for direct Transport login' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'Dispatch#2026', description: 'Initial login password' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 1, description: 'Role ID created via POST /api/transport/roles' })
  @IsInt()
  role_id: number;
}
