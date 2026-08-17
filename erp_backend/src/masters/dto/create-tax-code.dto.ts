import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateTaxCodeDto {
  @ApiProperty({ example: 'GST 18%' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 9.0 })
  @IsNumber()
  @Min(0)
  cgstPct: number;

  @ApiProperty({ example: 9.0 })
  @IsNumber()
  @Min(0)
  sgstPct: number;

  @ApiProperty({ example: 18.0 })
  @IsNumber()
  @Min(0)
  igstPct: number;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  effectiveFrom: Date;
}
