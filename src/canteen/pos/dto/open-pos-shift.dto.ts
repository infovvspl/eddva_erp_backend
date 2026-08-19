import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, Min } from 'class-validator';

export class OpenPosShiftDto {
  @ApiProperty({ example: 'terminal-uuid-here' })
  @IsNotEmpty()
  @IsString()
  terminalId: string;

  @ApiProperty({ example: 1000.0, description: 'Opening cash in drawer' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  openingCash: number;
}
