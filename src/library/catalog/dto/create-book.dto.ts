import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateBookDto {
  @ApiPropertyOptional({ example: '978-0-06-112008-4' })
  @IsOptional()
  @IsString()
  isbn?: string;

  @ApiProperty({ example: 'To Kill a Mockingbird' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ example: 'Harper Lee' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  author: string;

  @ApiPropertyOptional({ example: 'HarperCollins' })
  @IsOptional()
  @IsString()
  publisher?: string;

  @ApiPropertyOptional({ example: '1st' })
  @IsOptional()
  @IsString()
  edition?: string;

  @ApiProperty({ example: 1, description: 'category_id FK' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  category_id: number;

  @ApiPropertyOptional({ example: 'English' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ example: 1960 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  publish_year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
