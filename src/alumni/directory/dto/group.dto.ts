import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AlumniGroupType } from '@prisma/client';
import { PageQueryDto } from '../../common/page-query.dto';
import { ToBoolean, Trim } from '../../common/transforms';

export class CreateAlumniGroupDto {
  @ApiProperty({ example: 'Class of 2015' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ enum: AlumniGroupType, example: 'batch' })
  @IsEnum(AlumniGroupType)
  group_type: AlumniGroupType;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateAlumniGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ enum: AlumniGroupType })
  @IsOptional()
  @IsEnum(AlumniGroupType)
  group_type?: AlumniGroupType;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'false deactivates the group (members are kept)',
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class QueryAlumniGroupDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: AlumniGroupType })
  @IsOptional()
  @IsEnum(AlumniGroupType)
  group_type?: AlumniGroupType;

  @ApiPropertyOptional({
    description: 'Include deactivated groups (default false)',
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  include_inactive?: boolean;
}

export class AddGroupMembersDto {
  @ApiProperty({
    example: [1, 2, 3],
    description:
      'Alumni ids to add (max 500). Already-members are skipped, not errors.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsInt({ each: true })
  alumni_ids: number[];
}
