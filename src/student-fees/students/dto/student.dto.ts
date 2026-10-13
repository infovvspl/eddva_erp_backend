import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateFeeStudentDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  class_id: number;

  @ApiProperty({ example: 'Riya Sharma' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: '23' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  roll_no?: string;

  @ApiPropertyOptional({ example: 'Mr. Sharma' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  guardian_name?: string;

  @ApiPropertyOptional({ example: 'guardian@example.com', description: 'Email or phone' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  guardian_contact?: string;
}

export class UpdateFeeStudentDto {
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  class_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  roll_no?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  guardian_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  guardian_contact?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class QueryFeeStudentDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  class_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;
}
