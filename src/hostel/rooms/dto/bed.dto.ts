import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { HostelBedStatus } from '@prisma/client';
import { PageQueryDto } from '../../common/page-query.dto';

export class CreateHostelBedDto {
  @ApiProperty({ example: 'B1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  bed_number: string;
}

/** Bed status is derived from allotments and cannot be set by hand — only the label is editable. */
export class UpdateHostelBedDto {
  @ApiPropertyOptional({ example: 'B2' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  bed_number?: string;
}

export class QueryHostelBedDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  room_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  block_id?: number;

  @ApiPropertyOptional({ enum: HostelBedStatus })
  @IsOptional()
  @IsEnum(HostelBedStatus)
  status?: HostelBedStatus;
}
