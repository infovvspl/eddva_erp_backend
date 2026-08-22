import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateParticipantDto {
  @ApiPropertyOptional({ example: 'STD-2026-089' })
  @IsOptional()
  @IsString()
  external_ref_id?: string;

  @ApiProperty({ example: 'David Miller' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Class X-B' })
  @IsOptional()
  @IsString()
  class_section?: string;

  @ApiPropertyOptional({ example: 'https://storage.school.edu/photos/std-089.jpg' })
  @IsOptional()
  @IsString()
  photo_url?: string;

  @ApiPropertyOptional({ example: '24' })
  @IsOptional()
  @IsString()
  roll_number?: string;

  @ApiPropertyOptional({ example: 'male' })
  @IsOptional()
  @IsString()
  gender?: string;
}

export class UpdateParticipantDto extends PartialType(CreateParticipantDto) {}
