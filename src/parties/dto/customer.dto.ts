import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Status } from '@prisma/client';

export class CreateCustomerContactDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Procurement Officer' })
  @IsOptional()
  @IsString()
  designation?: string;

  @ApiProperty({ example: '+919876543211' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'jane@customer.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class CreateCustomerDto {
  @ApiProperty({ example: 'Apex Global Enterprises' })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiPropertyOptional({ example: '27BBBBB0000B1Z6' })
  @IsOptional()
  @IsString()
  gstin?: string;

  @ApiProperty({ example: 'Suite 400, Commerce Tower' })
  @IsString()
  @IsNotEmpty()
  addressLine1: string;

  @ApiPropertyOptional({ example: 'Downtown' })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiProperty({ example: 'Pune' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'Maharashtra' })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty({ example: '411001' })
  @IsString()
  @IsNotEmpty()
  pincode: string;

  @ApiProperty({ example: 'payment-term-uuid' })
  @IsUUID()
  @IsNotEmpty()
  paymentTermId: string;

  @ApiPropertyOptional({ example: 250000.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ApiPropertyOptional({ enum: Status, default: Status.ACTIVE })
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @ApiPropertyOptional({ type: [CreateCustomerContactDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCustomerContactDto)
  contacts?: CreateCustomerContactDto[];
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}
export class UpdateCustomerContactDto extends PartialType(CreateCustomerContactDto) {}
