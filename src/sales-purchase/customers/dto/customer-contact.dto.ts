import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateCustomerContactDto {
  @ApiProperty({ example: 'Priya Sharma' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Procurement Head' })
  @IsOptional()
  @IsString()
  designation?: string;

  @ApiPropertyOptional({ example: '9876500000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'priya@northwind.example' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class UpdateCustomerContactDto extends PartialType(
  CreateCustomerContactDto,
) {}
