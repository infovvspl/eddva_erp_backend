import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignInventoryUserToRoleDto {
  @ApiProperty({ example: 'usr_storekeeper_001', description: 'EDDVA employee/user identifier' })
  @IsString()
  @IsNotEmpty()
  eddva_user_id: string;

  @ApiProperty({ example: 'Raj Store Keeper' })
  @IsString()
  @IsNotEmpty()
  user_name: string;

  @ApiPropertyOptional({ example: 'raj@school.edu' })
  @IsOptional()
  @IsEmail()
  user_email?: string;

  @ApiProperty({ example: 'store_keeper_raj', description: 'Username for direct Inventory login' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'StoreKeeper#2026', description: 'Initial login password' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 1, description: 'Role ID created via POST /api/inventory/roles' })
  @IsInt()
  role_id: number;
}
