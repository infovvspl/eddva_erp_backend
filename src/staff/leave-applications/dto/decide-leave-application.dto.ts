import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DecideLeaveApplicationDto {
  @ApiPropertyOptional({ example: 'Overlapping with exam duty roster' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  decision_reason?: string;
}
