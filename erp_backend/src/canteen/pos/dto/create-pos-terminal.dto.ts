import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePosTerminalDto {
  @ApiProperty({ example: 'Counter 2 POS' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Canteen First Floor Block B' })
  @IsOptional()
  @IsString()
  location?: string;
}
