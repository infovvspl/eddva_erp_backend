import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateVendorContactDto {
  @ApiProperty({ example: 'Suresh Mehta' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Sales Manager' })
  @IsOptional()
  @IsString()
  designation?: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'suresh@brightelectronics.example' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class UpdateVendorContactDto extends PartialType(
  CreateVendorContactDto,
) {}
