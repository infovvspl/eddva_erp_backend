import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { HostelGenderType } from '@prisma/client';
import { PageQueryDto } from '../../common/page-query.dto';
import { ToBoolean } from '../../common/transforms';

export class CreateHostelBlockDto {
  @ApiProperty({ example: 'Block A — Boys' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: HostelGenderType, example: 'boys' })
  @IsEnum(HostelGenderType)
  gender_type: HostelGenderType;

  @ApiProperty({
    example: 4,
    description: 'Highest floor number; room floors may be 0..total_floors',
  })
  @IsInt()
  @Min(1)
  @Max(100)
  total_floors: number;

  @ApiPropertyOptional({
    example: 'usr_warden_001',
    description:
      'eddva_user_id of an active hostel staff member (primary warden)',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  warden_user_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHostelBlockDto extends PartialType(CreateHostelBlockDto) {}

export class AssignWardenDto {
  @ApiPropertyOptional({
    example: 'usr_warden_001',
    description: 'eddva_user_id of the new primary warden; omit/null to clear',
  })
  @IsOptional()
  @IsString()
  warden_user_id?: string | null;
}

export class QueryHostelBlockDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: HostelGenderType })
  @IsOptional()
  @IsEnum(HostelGenderType)
  gender_type?: HostelGenderType;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by primary warden eddva_user_id',
  })
  @IsOptional()
  @IsString()
  warden_user_id?: string;
}
