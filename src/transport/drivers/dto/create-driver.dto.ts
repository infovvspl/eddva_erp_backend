import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDriverDto {
  @ApiProperty({ example: 'Ramesh Kumar' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '9876543210' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'LIC123456' })
  @IsString()
  @IsNotEmpty()
  license_number: string;

  @ApiProperty({ example: '2028-12-31' })
  @IsDateString()
  license_expiry: string;

  @ApiPropertyOptional({ example: '12 MG Road, Pune' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/drivers/photo.jpg' })
  @IsOptional()
  @IsString()
  photo_url?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  joining_date?: string;
}
