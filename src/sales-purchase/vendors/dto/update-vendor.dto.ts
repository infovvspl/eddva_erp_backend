import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SpPartyStatus } from '@prisma/client';
import { CreateVendorDto } from './create-vendor.dto';

export class UpdateVendorDto extends PartialType(CreateVendorDto) {
  @ApiPropertyOptional({ enum: SpPartyStatus })
  @IsOptional()
  @IsEnum(SpPartyStatus)
  status?: SpPartyStatus;
}
