import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  HostelGenderType,
  HostelRoomStatus,
  HostelRoomType,
} from '@prisma/client';
import { PageQueryDto } from '../../common/page-query.dto';

export class CreateHostelRoomDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  block_id: number;

  @ApiProperty({ example: 'A-101' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  room_number: string;

  @ApiProperty({ example: 1, description: '0..block.total_floors' })
  @IsInt()
  @Min(0)
  @Max(100)
  floor: number;

  @ApiProperty({ enum: HostelRoomType, example: 'double' })
  @IsEnum(HostelRoomType)
  room_type: HostelRoomType;

  @ApiProperty({
    example: 2,
    description: 'single=1, double=2, triple=3, dormitory=2 or more',
  })
  @IsInt()
  @Min(1)
  @Max(500)
  capacity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateHostelRoomDto extends PartialType(CreateHostelRoomDto) {
  @ApiPropertyOptional({
    enum: ['available', 'under_maintenance'],
    description:
      '`under_maintenance` blocks allotments; `available` clears it. `full` is derived from occupancy and cannot be set.',
  })
  @IsOptional()
  @IsIn(['available', 'under_maintenance'])
  status?: 'available' | 'under_maintenance';
}

export class QueryHostelRoomDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  block_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  floor?: number;

  @ApiPropertyOptional({ enum: HostelRoomType })
  @IsOptional()
  @IsEnum(HostelRoomType)
  room_type?: HostelRoomType;

  @ApiPropertyOptional({ enum: HostelRoomStatus })
  @IsOptional()
  @IsEnum(HostelRoomStatus)
  status?: HostelRoomStatus;

  @ApiPropertyOptional({
    enum: HostelGenderType,
    description: 'Only rooms in blocks of this gender type',
  })
  @IsOptional()
  @IsEnum(HostelGenderType)
  gender_type?: HostelGenderType;
}
