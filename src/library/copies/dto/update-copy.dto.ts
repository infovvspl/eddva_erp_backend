import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateCopyDto } from './create-copy.dto';

export enum CopyStatus {
  available = 'available',
  issued = 'issued',
  reserved = 'reserved',
  lost = 'lost',
  under_repair = 'under_repair',
  withdrawn = 'withdrawn',
}

export class UpdateCopyDto extends PartialType(CreateCopyDto) {
  @ApiPropertyOptional({ enum: CopyStatus })
  @IsOptional()
  @IsEnum(CopyStatus)
  status?: CopyStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rack_location?: string;
}
