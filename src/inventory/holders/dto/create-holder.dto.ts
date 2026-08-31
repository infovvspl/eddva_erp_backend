import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum HolderTypeDto {
  staff = 'staff',
  student = 'student',
  department = 'department',
}

export class CreateHolderDto {
  @ApiProperty({ enum: HolderTypeDto, example: HolderTypeDto.staff })
  @IsEnum(HolderTypeDto)
  holder_type: HolderTypeDto;

  @ApiProperty({ example: 'Priya Sharma' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'STF-00234', description: 'Reference id in the parent staff/student system, if available' })
  @IsOptional()
  @IsString()
  external_ref_id?: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  contact_phone?: string;
}
