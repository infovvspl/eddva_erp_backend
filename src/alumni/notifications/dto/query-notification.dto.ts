import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import {
  AlumniNotificationAudience,
  AlumniNotificationStatus,
} from '@prisma/client';
import { PageQueryDto } from '../../common/page-query.dto';

export class QueryNotificationDto extends PageQueryDto {
  @ApiPropertyOptional({ example: 'donation_receipt' })
  @IsOptional()
  @IsString()
  event_type?: string;

  @ApiPropertyOptional({ example: 'alumni_event' })
  @IsOptional()
  @IsString()
  entity_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  entity_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  alumni_id?: number;

  @ApiPropertyOptional({ enum: AlumniNotificationAudience })
  @IsOptional()
  @IsEnum(AlumniNotificationAudience)
  audience?: AlumniNotificationAudience;

  @ApiPropertyOptional({ enum: AlumniNotificationStatus })
  @IsOptional()
  @IsEnum(AlumniNotificationStatus)
  status?: AlumniNotificationStatus;
}
