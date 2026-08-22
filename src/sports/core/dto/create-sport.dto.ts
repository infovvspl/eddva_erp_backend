import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SportsCategory } from '@prisma/client';

export class CreateSportDto {
  @ApiProperty({ example: 'Football' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: SportsCategory, example: SportsCategory.team })
  @IsEnum(SportsCategory)
  category: SportsCategory;

  @ApiPropertyOptional({ example: 'Association football / soccer' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateSportDto extends PartialType(CreateSportDto) {}
