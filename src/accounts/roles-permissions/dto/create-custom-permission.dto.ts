import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateAccountsCustomPermissionDto {
  @ApiProperty({ example: 'vouchers', description: 'Target resource key' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({ example: 'export', description: 'Action key' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiProperty({ example: 'Export Vouchers' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Vouchers' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'Allows exporting the voucher register to CSV' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateAccountsCustomPermissionDto extends PartialType(CreateAccountsCustomPermissionDto) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
