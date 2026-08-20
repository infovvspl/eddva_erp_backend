import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CanteenOrderItemDto } from './canteen-order-item.dto';

export class UpdateCanteenOrderDto {
  @ApiPropertyOptional({ example: 'member-uuid-here' })
  @IsOptional()
  @IsString()
  memberId?: string;

  @ApiPropertyOptional({ example: 'terminal-uuid-here' })
  @IsOptional()
  @IsString()
  terminalId?: string;

  @ApiPropertyOptional({ example: 0.0, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number = 0;

  @ApiPropertyOptional({ type: [CanteenOrderItemDto], description: 'Items to replace existing items' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CanteenOrderItemDto)
  items?: CanteenOrderItemDto[];
}
