import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_ONLY_REGEX } from '../../common/time.util';
import { Trim } from '../../common/transforms';

const DATE_MESSAGE = 'must be a date in YYYY-MM-DD format';

export class CreateEmploymentDto {
  @ApiProperty({ example: 'Acme Corp' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  company: string;

  @ApiProperty({ example: 'Product Manager' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  designation: string;

  @ApiPropertyOptional({ example: 'Technology' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional({ example: 'Bangalore' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiProperty({ example: '2020-06-01' })
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: `start_date ${DATE_MESSAGE}` })
  start_date: string;

  @ApiPropertyOptional({
    example: '2023-03-31',
    description:
      'Required unless is_current is true; must be empty for a current position',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: `end_date ${DATE_MESSAGE}` })
  end_date?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Marks the current position. Any other current position of this alumnus is closed automatically.',
  })
  @IsOptional()
  @IsBoolean()
  is_current?: boolean;
}

export class UpdateEmploymentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  designation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: `start_date ${DATE_MESSAGE}` })
  start_date?: string;

  @ApiPropertyOptional({
    description: 'Send null to clear (only valid for a current position)',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: `end_date ${DATE_MESSAGE}` })
  end_date?: string;
}
