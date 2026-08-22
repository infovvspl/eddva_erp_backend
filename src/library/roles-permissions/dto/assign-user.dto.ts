import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AssignUserToRoleDto {
  @ApiProperty({ example: 'a1b2-c3d4-...', description: 'EDDVA platform user UUID' })
  @IsString()
  @IsNotEmpty()
  eddva_user_id: string;

  @ApiProperty({ example: 'Anita Sharma' })
  @IsString()
  @IsNotEmpty()
  user_name: string;

  @ApiPropertyOptional({ example: 'anita@school.edu' })
  @IsOptional()
  @IsString()
  user_email?: string;

  @ApiProperty({ example: 'anita_lib', description: 'Login username created by Institute Admin' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'LibraryPass#2026', description: 'Login password created by Institute Admin for this user' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @ApiProperty({ example: 1, description: 'role_id of the dynamic role to assign' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  role_id: number;
}
