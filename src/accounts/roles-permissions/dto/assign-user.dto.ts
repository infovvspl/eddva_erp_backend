import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignAccountsUserToRoleDto {
  @ApiProperty({ example: 'usr_accountant_001', description: 'EDDVA employee/user identifier' })
  @IsString()
  @IsNotEmpty()
  eddva_user_id: string;

  @ApiProperty({ example: 'Priya Accountant' })
  @IsString()
  @IsNotEmpty()
  user_name: string;

  @ApiPropertyOptional({ example: 'priya@school.edu' })
  @IsOptional()
  @IsEmail()
  user_email?: string;

  @ApiProperty({ example: 'accountant_priya', description: 'Username for direct Accounts login' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'Accountant#2026', description: 'Initial login password' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 1, description: 'Role ID created via POST /api/accounts/roles' })
  @IsInt()
  role_id: number;
}
