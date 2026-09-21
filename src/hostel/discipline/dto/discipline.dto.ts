import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  HostelDisciplineAction,
  HostelDisciplineCategory,
} from '@prisma/client';
import { DateRangeQueryDto } from '../../common/page-query.dto';
import { MAX_AMOUNT } from '../../common/validation';

export class CreateDisciplineRecordDto {
  @ApiProperty({ example: '2026-09-20' })
  @IsString()
  incident_date: string;

  @ApiProperty({ enum: HostelDisciplineCategory, example: 'curfew_violation' })
  @IsEnum(HostelDisciplineCategory)
  category: HostelDisciplineCategory;

  @ApiProperty({
    example: 'Returned 90 minutes after curfew without permission',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @ApiProperty({ enum: HostelDisciplineAction, example: 'warning' })
  @IsEnum(HostelDisciplineAction)
  action_taken: HostelDisciplineAction;

  @ApiPropertyOptional({
    example: 500,
    description:
      'Required when action_taken is fine; not allowed otherwise. Recorded only — it does not create an invoice',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_AMOUNT)
  fine_amount?: number;

  @ApiPropertyOptional({
    example: 12,
    description:
      'A gate pass of THIS resident the incident relates to (e.g. a late return)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  gate_pass_id?: number;
}

export class LinkGatePassDto {
  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(1)
  gate_pass_id: number;
}

export class QueryDisciplineDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ enum: HostelDisciplineCategory })
  @IsOptional()
  @IsEnum(HostelDisciplineCategory)
  category?: HostelDisciplineCategory;

  @ApiPropertyOptional({ enum: HostelDisciplineAction })
  @IsOptional()
  @IsEnum(HostelDisciplineAction)
  action_taken?: HostelDisciplineAction;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  resident_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  gate_pass_id?: number;
}
