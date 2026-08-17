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

export class CreateCanteenOrderDto {
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

  @ApiProperty({ type: [CanteenOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CanteenOrderItemDto)
  items: CanteenOrderItemDto[];
}
