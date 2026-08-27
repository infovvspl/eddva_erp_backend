import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class EscalateComplaintDto {
  @ApiProperty({ example: 1, description: 'employee_id of the manager to escalate to' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  to_employee_id: number;

  @ApiPropertyOptional({ example: 'No response from assignee for 48 hours' })
  @IsOptional()
  @IsString()
  reason?: string;
}
