import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ComplaintPriorityDto } from './create-complaint.dto';

export class ChangeComplaintPriorityDto {
  @ApiProperty({ enum: ComplaintPriorityDto })
  @IsEnum(ComplaintPriorityDto)
  priority: ComplaintPriorityDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
