import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CancelAppointmentDto {
  @ApiPropertyOptional({ example: 'Visitor requested cancellation' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CompleteAppointmentDto {
  @ApiPropertyOptional({ example: 'Discussed admission requirements, follow-up email sent' })
  @IsOptional()
  @IsString()
  notes?: string;
}
