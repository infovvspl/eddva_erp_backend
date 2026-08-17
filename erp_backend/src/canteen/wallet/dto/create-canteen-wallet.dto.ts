import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class CreateCanteenWalletDto {
  @ApiPropertyOptional({ example: 0.0, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialBalance?: number = 0;

  @ApiPropertyOptional({ example: 200.0, description: 'Max daily spend limit for student' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  dailySpendLimit?: number;
}
