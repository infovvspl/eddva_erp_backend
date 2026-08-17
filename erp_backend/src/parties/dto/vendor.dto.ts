import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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
import { VendorStatus } from '@prisma/client';

export class CreateVendorContactDto {
  @ApiProperty({ example: 'John Smith' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Sales Manager' })
  @IsOptional()
  @IsString()
  designation?: string;

  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'john@vendor.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class CreateVendorBankDetailDto {
  @ApiProperty({ example: '987654321012' })
  @IsString()
  @IsNotEmpty()
  accountNo: string;

  @ApiProperty({ example: 'SBIN0001234' })
  @IsString()
  @IsNotEmpty()
  ifsc: string;

  @ApiPropertyOptional({ example: 'SBININBBXXX' })
  @IsOptional()
  @IsString()
  swift?: string;

  @ApiProperty({ example: 'State Bank of India' })
  @IsString()
  @IsNotEmpty()
  bankName: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateVendorDto {
  @ApiProperty({ example: 'Acme Industrial Corp' })
  @IsString()
  @IsNotEmpty()
  vendorName: string;

  @ApiPropertyOptional({ example: '27AAAAA0000A1Z5' })
  @IsOptional()
  @IsString()
  gstin?: string;

  @ApiPropertyOptional({ example: 'PAN1234567' })
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiProperty({ example: 'Building 12, Tech Park' })
  @IsString()
  @IsNotEmpty()
  addressLine1: string;

  @ApiPropertyOptional({ example: 'Phase 2' })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiProperty({ example: 'Mumbai' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'Maharashtra' })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty({ example: '400001' })
  @IsString()
  @IsNotEmpty()
  pincode: string;

  @ApiProperty({ example: 'payment-term-uuid' })
  @IsUUID()
  @IsNotEmpty()
  paymentTermId: string;

  @ApiPropertyOptional({ example: 100000.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ApiPropertyOptional({ enum: VendorStatus, default: VendorStatus.ACTIVE })
  @IsOptional()
  @IsEnum(VendorStatus)
  status?: VendorStatus;

  @ApiPropertyOptional({ type: [CreateVendorContactDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVendorContactDto)
  contacts?: CreateVendorContactDto[];

  @ApiPropertyOptional({ type: [CreateVendorBankDetailDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVendorBankDetailDto)
  bankDetails?: CreateVendorBankDetailDto[];
}

export class UpdateVendorDto extends PartialType(CreateVendorDto) {}
export class UpdateVendorContactDto extends PartialType(CreateVendorContactDto) {}
export class UpdateVendorBankDetailDto extends PartialType(CreateVendorBankDetailDto) {}
