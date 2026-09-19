import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignCanteenUserToRoleDto {
  @ApiProperty({
    example: 'usr_counter_staff_001',
    description: 'EDDVA employee/user identifier',
  })
  @IsString()
  @IsNotEmpty()
  eddva_user_id: string;

  @ApiProperty({ example: 'Raj Counter Staff' })
  @IsString()
  @IsNotEmpty()
  user_name: string;

  @ApiPropertyOptional({ example: 'raj@school.edu' })
  @IsOptional()
  @IsEmail()
  user_email?: string;

  @ApiProperty({
    example: 'counter_staff_raj',
    description: 'Username for direct Canteen login',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    example: 'CounterStaff#2026',
    description: 'Initial login password',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({
    example: 1,
    description: 'Role ID created via POST /api/canteen/roles',
  })
  @IsInt()
  role_id: number;
}
