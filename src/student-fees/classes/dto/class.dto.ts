import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFeeClassDto {
  @ApiProperty({ example: 'Grade 5' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '2026-27' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  academic_year: string;
}

export class UpdateFeeClassDto {
  @ApiPropertyOptional({ example: 'Grade 5 - A' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class QueryFeeClassDto {
  @ApiPropertyOptional({ example: '2026-27' })
  @IsOptional()
  @IsString()
  academic_year?: string;
}
