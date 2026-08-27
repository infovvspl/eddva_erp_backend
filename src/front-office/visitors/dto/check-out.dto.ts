import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CheckOutDto {
  @ApiPropertyOptional({ example: 'Meeting completed on time' })
  @IsOptional()
  @IsString()
  remarks?: string;
}
