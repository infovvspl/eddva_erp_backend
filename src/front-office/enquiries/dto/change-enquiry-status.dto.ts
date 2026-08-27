import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum EnquiryStatusDto {
  open = 'open',
  in_progress = 'in_progress',
  closed = 'closed',
}

export class ChangeEnquiryStatusDto {
  @ApiProperty({ enum: EnquiryStatusDto })
  @IsEnum(EnquiryStatusDto)
  status: EnquiryStatusDto;

  @ApiPropertyOptional({ example: 'Enquirer confirmed enrollment elsewhere' })
  @IsOptional()
  @IsString()
  reason?: string;
}
