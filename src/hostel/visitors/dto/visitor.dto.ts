import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsBoolean,
} from 'class-validator';
import { DateRangeQueryDto } from '../../common/page-query.dto';
import { ToBoolean } from '../../common/transforms';

export class CreateVisitorLogDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  resident_id: number;

  @ApiProperty({ example: 'Rakesh Sharma' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  visitor_name: string;

  @ApiProperty({ example: 'Father' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  relation: string;

  @ApiPropertyOptional({ example: 'Aadhaar' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  id_proof_type?: string;

  @ApiPropertyOptional({
    example: '1234-5678-9012',
    description:
      'Stored encrypted; everyone sees only the last 4 characters unless they hold visitors:view_id',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  id_proof_number?: string;

  @ApiPropertyOptional({ example: 'Parent meeting' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  purpose?: string;

  @ApiPropertyOptional({ description: 'Default now; cannot be in the future' })
  @IsOptional()
  @IsDateString()
  in_time?: string;
}

export class QueryVisitorLogDto extends DateRangeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  resident_id?: number;

  @ApiPropertyOptional({ description: 'true = still inside (not checked out)' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  active?: boolean;
}
