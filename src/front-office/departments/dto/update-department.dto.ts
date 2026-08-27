import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum FoStatusDto {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional({ example: 'Admissions' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: FoStatusDto })
  @IsOptional()
  @IsEnum(FoStatusDto)
  status?: FoStatusDto;
}
