import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTaxCodeDto {
  @ApiProperty({ example: 'GST 18%' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 9 })
  @IsNumber()
  @Min(0)
  @Max(100)
  cgst_pct: number;

  @ApiProperty({ example: 9 })
  @IsNumber()
  @Min(0)
  @Max(100)
  sgst_pct: number;

  @ApiProperty({ example: 18 })
  @IsNumber()
  @Min(0)
  @Max(100)
  igst_pct: number;

  @ApiProperty({
    example: '2026-04-01',
    description: 'Date this rate becomes effective',
  })
  @IsDateString()
  effective_from: string;
}
