import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum AdjustmentReasonDto {
  damaged = 'damaged',
  expired = 'expired',
  lost = 'lost',
  audit_correction = 'audit_correction',
}

export class CreateAdjustmentDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  item_id: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  location_id: number;

  @ApiProperty({
    example: -5,
    description: 'Signed quantity change — negative for damaged/expired/lost, positive for an audit_correction increase',
  })
  @Type(() => Number)
  @IsInt()
  quantity_delta: number;

  @ApiProperty({ enum: AdjustmentReasonDto, example: AdjustmentReasonDto.damaged })
  @IsEnum(AdjustmentReasonDto)
  reason: AdjustmentReasonDto;

  @ApiPropertyOptional({ example: 'Water damage during monsoon leak in store room' })
  @IsOptional()
  @IsString()
  remarks?: string;
}
