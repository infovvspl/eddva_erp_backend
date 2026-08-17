import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { CanteenFoodType } from '@prisma/client';

export class CreateMenuItemDto {
  @ApiProperty({ example: 'cat-uuid-here' })
  @IsNotEmpty()
  @IsString()
  categoryId: string;

  @ApiProperty({ example: 'Paneer Butter Masala Combo' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Served with 2 Naan and Jeera Rice' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 140.0 })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 5.0, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number = 0;

  @ApiPropertyOptional({ enum: CanteenFoodType, default: CanteenFoodType.VEG })
  @IsOptional()
  @IsEnum(CanteenFoodType)
  foodType?: CanteenFoodType = CanteenFoodType.VEG;

  @ApiPropertyOptional({ example: 'https://cdn.eddva.com/items/paneer.jpg' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean = true;

  @ApiPropertyOptional({ example: 'MON,TUE,WED,THU,FRI' })
  @IsOptional()
  @IsString()
  availableDays?: string;
}
