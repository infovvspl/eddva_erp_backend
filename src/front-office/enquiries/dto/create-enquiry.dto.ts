import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum EnquirySourceDto {
  walk_in = 'walk_in',
  phone = 'phone',
  email = 'email',
  website = 'website',
}

export class CreateEnquiryDto {
  @ApiProperty({ example: 'Anita Desai' })
  @IsString()
  @IsNotEmpty()
  enquirer_name: string;

  @ApiPropertyOptional({ example: '9876500000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'anita@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ enum: EnquirySourceDto, example: EnquirySourceDto.walk_in })
  @IsEnum(EnquirySourceDto)
  source: EnquirySourceDto;

  @ApiProperty({ example: 'admission', description: 'Free-form category — e.g. admission, sales, general, support' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ example: 'Interested in Grade 5 admission for 2027' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ example: 1, description: 'employee_id to assign to immediately' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigned_to?: number;
}
