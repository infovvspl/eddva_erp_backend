import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  IsEnum,
  IsBoolean,
  Matches,
} from 'class-validator';

const AVAILABLE_DAYS_PATTERN =
  /^(MON|TUE|WED|THU|FRI|SAT|SUN)(,(MON|TUE|WED|THU|FRI|SAT|SUN))*$/;
import { CanteenFoodType } from '@prisma/client';

export class UpdateMenuItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @ApiPropertyOptional({ enum: CanteenFoodType })
  @IsOptional()
  @IsEnum(CanteenFoodType)
  foodType?: CanteenFoodType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ example: 'MON,TUE,WED,THU,FRI' })
  @IsOptional()
  @IsString()
  @Matches(AVAILABLE_DAYS_PATTERN, {
    message: 'availableDays must be a comma-separated list of MON,TUE,WED,THU,FRI,SAT,SUN',
  })
  availableDays?: string;
}
