import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class UpdatePaymentTermDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  termName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  days?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
