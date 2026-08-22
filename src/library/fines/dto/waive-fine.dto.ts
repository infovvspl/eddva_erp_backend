import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WaiveFineDto {
  @ApiProperty({ example: 'Financial hardship approved by principal' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
