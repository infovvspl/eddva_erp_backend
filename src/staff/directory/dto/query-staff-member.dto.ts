import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StaffTypeDto } from './create-staff-member.dto';

export enum StaffStatusDto {
  active = 'active',
  resigned = 'resigned',
  terminated = 'terminated',
}

export class QueryStaffMemberDto {
  @ApiPropertyOptional({ enum: StaffTypeDto })
  @IsOptional()
  @IsEnum(StaffTypeDto)
  staff_type?: StaffTypeDto;

  @ApiPropertyOptional({ enum: StaffStatusDto })
  @IsOptional()
  @IsEnum(StaffStatusDto)
  status?: StaffStatusDto;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  department_id?: number;

  @ApiPropertyOptional({ example: 'Aarav' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}
