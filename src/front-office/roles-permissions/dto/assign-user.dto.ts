import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignFrontOfficeUserToRoleDto {
  @ApiProperty({ example: 'usr_frontdesk_001', description: 'EDDVA employee/user identifier' })
  @IsString()
  @IsNotEmpty()
  eddva_user_id: string;

  @ApiProperty({ example: 'Asha Front Desk' })
  @IsString()
  @IsNotEmpty()
  user_name: string;

  @ApiPropertyOptional({ example: 'asha@school.edu' })
  @IsOptional()
  @IsEmail()
  user_email?: string;

  @ApiProperty({ example: 'front_desk_asha', description: 'Username for direct Front Office login' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'FrontDesk#2026', description: 'Initial login password' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 1, description: 'Role ID created via POST /api/front-office/roles' })
  @IsInt()
  role_id: number;
}
