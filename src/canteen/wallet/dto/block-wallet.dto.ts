import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class BlockWalletDto {
  @ApiPropertyOptional({ example: 'Lost ID card reported by student' })
  @IsOptional()
  @IsString()
  reason?: string;
}
