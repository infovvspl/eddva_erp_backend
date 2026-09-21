import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AlumniCommChannel,
  AlumniCommStatus,
  AlumniNewsletterStatus,
} from '@prisma/client';
import { PageQueryDto } from '../../common/page-query.dto';
import { Trim } from '../../common/transforms';

/**
 * A newsletter audience as STRUCTURED, whitelisted filters — never a query
 * string. Within one field the values are OR-ed ("batch 2015 or 2016"); across
 * fields they are AND-ed ("… and in Bangalore"). Evaluated against current
 * alumni data when the newsletter is sent, so nobody is stored as a recipient.
 */
export class NewsletterSegmentDto {
  @ApiPropertyOptional({
    description:
      'true = every verified, active alumnus who opted in. Must be explicit, and cannot be combined with filters',
  })
  @IsOptional()
  @IsBoolean()
  all?: boolean;

  @ApiPropertyOptional({ example: [2015, 2016] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @Min(1900, { each: true })
  @Max(2100, { each: true })
  batch_years?: number[];

  @ApiPropertyOptional({ example: [2015] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @Min(1900, { each: true })
  @Max(2100, { each: true })
  graduation_years?: number[];

  @ApiPropertyOptional({ example: ['MBA'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  programs?: string[];

  @ApiPropertyOptional({ example: ['Bangalore'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  cities?: string[];

  @ApiPropertyOptional({ example: ['India'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  countries?: string[];

  @ApiPropertyOptional({ example: ['Technology'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  industries?: string[];

  @ApiPropertyOptional({ example: ['Acme Corp'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(150, { each: true })
  companies?: string[];

  @ApiPropertyOptional({
    example: [1, 2],
    description: 'Members of any of these (active) alumni groups',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  group_ids?: number[];
}

export class CreateNewsletterDto {
  @ApiProperty({ example: 'Alumni Meet 2026 — save the date' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  content: string;

  @ApiProperty({ type: NewsletterSegmentDto })
  @ValidateNested()
  @Type(() => NewsletterSegmentDto)
  target_segment: NewsletterSegmentDto;
}

export class UpdateNewsletterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  content?: string;

  @ApiPropertyOptional({ type: NewsletterSegmentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NewsletterSegmentDto)
  target_segment?: NewsletterSegmentDto;
}

export class SegmentPreviewDto {
  @ApiProperty({ type: NewsletterSegmentDto })
  @ValidateNested()
  @Type(() => NewsletterSegmentDto)
  target_segment: NewsletterSegmentDto;
}

export class SendNewsletterDto {
  @ApiPropertyOptional({
    enum: AlumniCommChannel,
    isArray: true,
    default: ['email'],
    description:
      'SMS reaches only alumni with a phone number who opted in to SMS',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(AlumniCommChannel, { each: true })
  channels?: AlumniCommChannel[];
}

export class QueryNewsletterDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: AlumniNewsletterStatus })
  @IsOptional()
  @IsEnum(AlumniNewsletterStatus)
  status?: AlumniNewsletterStatus;
}

export class PreviewRecipientsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: AlumniCommChannel, default: 'email' })
  @IsOptional()
  @IsEnum(AlumniCommChannel)
  channel?: AlumniCommChannel;
}

export class QueryCommunicationLogDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  newsletter_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  alumni_id?: number;

  @ApiPropertyOptional({ enum: AlumniCommChannel })
  @IsOptional()
  @IsEnum(AlumniCommChannel)
  channel?: AlumniCommChannel;

  @ApiPropertyOptional({ enum: AlumniCommStatus })
  @IsOptional()
  @IsEnum(AlumniCommStatus)
  status?: AlumniCommStatus;
}

export class UpdateCommunicationLogDto {
  @ApiProperty({
    enum: ['sent', 'opened', 'clicked', 'failed'],
    description:
      'Delivery feedback from the mail/SMS provider or its delivery worker. Statuses only move forward: queued → sent|failed, sent → opened|clicked|failed, opened → clicked',
  })
  @IsIn(['sent', 'opened', 'clicked', 'failed'])
  status: 'sent' | 'opened' | 'clicked' | 'failed';

  @ApiPropertyOptional({ description: 'For failed' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  failure_reason?: string;
}
