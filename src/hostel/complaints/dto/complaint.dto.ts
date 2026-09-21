import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  HostelComplaintCategory,
  HostelComplaintPriority,
  HostelComplaintStatus,
} from '@prisma/client';
import { DateRangeQueryDto } from '../../common/page-query.dto';

export class CreateHostelComplaintDto {
  @ApiPropertyOptional({
    example: 1,
    description:
      'Resident raising it. At least one of resident_id / room_id is required',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  resident_id?: number;

  @ApiPropertyOptional({
    example: 12,
    description: "Room concerned; defaults to the resident's current room",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  room_id?: number;

  @ApiProperty({ enum: HostelComplaintCategory, example: 'electrical' })
  @IsEnum(HostelComplaintCategory)
  category: HostelComplaintCategory;

  @ApiProperty({ example: 'Ceiling fan makes a grinding noise and wobbles' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ enum: HostelComplaintPriority, default: 'medium' })
  @IsOptional()
  @IsEnum(HostelComplaintPriority)
  priority?: HostelComplaintPriority;
}

export class UpdateHostelComplaintDto {
  @ApiPropertyOptional({ enum: HostelComplaintCategory })
  @IsOptional()
  @IsEnum(HostelComplaintCategory)
  category?: HostelComplaintCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: HostelComplaintPriority })
  @IsOptional()
  @IsEnum(HostelComplaintPriority)
  priority?: HostelComplaintPriority;
}

export class AssignHostelComplaintDto {
  @ApiProperty({
    example: 'usr_maintenance_007',
    description: 'eddva_user_id of an active hostel staff member',
  })
  @IsString()
  @IsNotEmpty()
  assigned_to: string;

  @ApiPropertyOptional({ example: 'Please check today' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ChangeHostelComplaintStatusDto {
  @ApiProperty({ enum: HostelComplaintStatus, example: 'in_progress' })
  @IsEnum(HostelComplaintStatus)
  status: HostelComplaintStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ResolveHostelComplaintDto {
  @ApiProperty({ example: 'Replaced the fan capacitor' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  resolution_notes: string;
}

export class CloseHostelComplaintDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateHostelComplaintUpdateDto {
  @ApiProperty({ example: 'Technician visited; part ordered' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  notes: string;
}

export class QueryHostelComplaintDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ enum: HostelComplaintStatus })
  @IsOptional()
  @IsEnum(HostelComplaintStatus)
  status?: HostelComplaintStatus;

  @ApiPropertyOptional({ enum: HostelComplaintPriority })
  @IsOptional()
  @IsEnum(HostelComplaintPriority)
  priority?: HostelComplaintPriority;

  @ApiPropertyOptional({ enum: HostelComplaintCategory })
  @IsOptional()
  @IsEnum(HostelComplaintCategory)
  category?: HostelComplaintCategory;

  @ApiPropertyOptional({ description: 'eddva_user_id of the assignee' })
  @IsOptional()
  @IsString()
  assigned_to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  resident_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  room_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  block_id?: number;
}
