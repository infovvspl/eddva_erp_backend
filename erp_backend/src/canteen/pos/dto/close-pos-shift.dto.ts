import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, Min } from 'class-validator';

export class ClosePosShiftDto {
  @ApiProperty({ example: 4850.0, description: 'Actual physical closing cash counted in drawer' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  closingCash: number;
}
