import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum AssetStatusDto {
  in_store = 'in_store',
  issued = 'issued',
  under_repair = 'under_repair',
  disposed = 'disposed',
  lost = 'lost',
}

export class UpdateAssetUnitDto {
  @ApiPropertyOptional({ example: 'SN-998877' })
  @IsOptional()
  @IsString()
  serial_number?: string;

  @ApiPropertyOptional({ enum: AssetStatusDto, description: 'Manual status override — issue/return endpoints manage this automatically for normal flows' })
  @IsOptional()
  @IsEnum(AssetStatusDto)
  status?: AssetStatusDto;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  current_location_id?: number;

  @ApiPropertyOptional({ example: '2028-08-29' })
  @IsOptional()
  @IsDateString()
  warranty_expiry?: string;
}
