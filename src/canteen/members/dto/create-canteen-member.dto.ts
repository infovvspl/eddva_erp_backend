import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';
import { CanteenMemberType } from '@prisma/client';

export class CreateCanteenMemberDto {
  @ApiProperty({ example: 'John Doe' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: CanteenMemberType, default: CanteenMemberType.STUDENT })
  @IsOptional()
  @IsEnum(CanteenMemberType)
  memberType?: CanteenMemberType = CanteenMemberType.STUDENT;

  @ApiProperty({ example: 'BC1002', description: 'Unique barcode on ID card' })
  @IsNotEmpty()
  @IsString()
  idCardBarcode: string;

  @ApiPropertyOptional({ example: 'STU-2026-99', description: 'External ERP Student/Staff ID reference' })
  @IsOptional()
  @IsString()
  externalRefId?: string;
}
