import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { CanteenMemberType } from '@prisma/client';

export class UpdateCanteenMemberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: CanteenMemberType })
  @IsOptional()
  @IsEnum(CanteenMemberType)
  memberType?: CanteenMemberType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idCardBarcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalRefId?: string;
}
