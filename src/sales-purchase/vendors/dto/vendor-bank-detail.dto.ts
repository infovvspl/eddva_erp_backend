import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateVendorBankDetailDto {
  @ApiProperty({ example: '123456789012' })
  @IsString()
  @IsNotEmpty()
  account_no: string;

  @ApiPropertyOptional({ example: 'HDFC0001234' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, {
    message: 'ifsc must be a valid 11-character IFSC code',
  })
  ifsc?: string;

  @ApiPropertyOptional({ example: 'HDFCINBB' })
  @IsOptional()
  @IsString()
  swift?: string;

  @ApiProperty({ example: 'HDFC Bank' })
  @IsString()
  @IsNotEmpty()
  bank_name: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Setting this true automatically unsets any other primary account for the vendor',
  })
  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}

export class UpdateVendorBankDetailDto extends PartialType(
  CreateVendorBankDetailDto,
) {}
