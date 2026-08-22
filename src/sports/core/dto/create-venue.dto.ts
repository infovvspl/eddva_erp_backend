import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SportsVenueType } from '@prisma/client';

export class CreateVenueDto {
  @ApiProperty({ example: 'Main Football Ground' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: SportsVenueType, example: SportsVenueType.ground })
  @IsEnum(SportsVenueType)
  type: SportsVenueType;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  capacity?: number;

  @ApiPropertyOptional({ example: 'North Campus Sports Complex' })
  @IsOptional()
  @IsString()
  location?: string;
}

export class UpdateVenueDto extends PartialType(CreateVenueDto) {}
