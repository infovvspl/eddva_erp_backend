import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateAdmissionProgramDto {
  @ApiProperty({ example: 'Grade 5' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({
    example: 'Primary',
    description: 'Level/stage the program belongs to',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  level: string;

  @ApiProperty({
    example: 60,
    description: 'Seats available per academic session',
  })
  @IsInt()
  @Min(0)
  @Max(100000)
  total_seats: number;

  @ApiPropertyOptional({ example: 'Completed Grade 4 with 60%+' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  eligibility_criteria?: string;
}

export class UpdateAdmissionProgramDto extends PartialType(
  CreateAdmissionProgramDto,
) {}

export class QueryAdmissionProgramDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Matches name or level' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['name', 'level', 'total_seats', 'created_at'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}
