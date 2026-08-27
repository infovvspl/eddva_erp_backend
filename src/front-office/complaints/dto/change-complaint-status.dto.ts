import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ComplaintStatusDto {
  open = 'open',
  in_progress = 'in_progress',
  resolved = 'resolved',
  closed = 'closed',
}

export class ChangeComplaintStatusDto {
  @ApiProperty({ enum: ComplaintStatusDto })
  @IsEnum(ComplaintStatusDto)
  status: ComplaintStatusDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
