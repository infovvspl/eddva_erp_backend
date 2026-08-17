import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, Min } from 'class-validator';

export class CanteenOrderItemDto {
  @ApiProperty({ example: 'item-uuid-here' })
  @IsNotEmpty()
  @IsString()
  itemId: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  quantity: number;
}
