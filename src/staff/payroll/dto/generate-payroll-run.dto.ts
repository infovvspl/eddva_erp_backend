import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GeneratePayrollRunDto {
  @ApiProperty({ example: 11, description: 'Calendar month, 1-12' })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2000)
  year: number;
}
