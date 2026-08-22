import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SportsStaffRole } from '@prisma/client';

export class CreateStaffDto {
  @ApiPropertyOptional({ example: 'EMP-STF-102' })
  @IsOptional()
  @IsString()
  external_ref_id?: string;

  @ApiProperty({ example: 'Robert Johnson' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Head Coach', description: 'Staff role designation (e.g. Head Coach, House Master, Official, Coach)' })
  @IsString()
  @IsNotEmpty()
  role: string;

  @ApiPropertyOptional({ example: 'michael.coach@school.edu' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateStaffDto extends PartialType(CreateStaffDto) {}
