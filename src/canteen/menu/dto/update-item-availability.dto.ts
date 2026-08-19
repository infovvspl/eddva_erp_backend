import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateItemAvailabilityDto {
  @ApiProperty({ example: false })
  @IsNotEmpty()
  @IsBoolean()
  isAvailable: boolean;
}
