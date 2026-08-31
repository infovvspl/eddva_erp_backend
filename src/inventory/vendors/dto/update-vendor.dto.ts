import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateVendorDto } from './create-vendor.dto';
import { InvStatusDto } from '../../categories/dto/update-category.dto';

export class UpdateVendorDto extends PartialType(CreateVendorDto) {
  @ApiPropertyOptional({ enum: InvStatusDto })
  @IsOptional()
  @IsEnum(InvStatusDto)
  status?: InvStatusDto;
}
