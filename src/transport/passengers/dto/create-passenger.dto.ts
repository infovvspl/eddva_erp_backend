import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PassengerTypeDto {
  student = 'student',
  employee = 'employee',
}

export class CreatePassengerDto {
  @ApiPropertyOptional({ example: 'STU-00234', description: 'Reference id in the parent staff/student system, if available' })
  @IsOptional()
  @IsString()
  external_ref_id?: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: PassengerTypeDto, example: PassengerTypeDto.student })
  @IsEnum(PassengerTypeDto)
  type: PassengerTypeDto;
}
