import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum ComplaintPriorityDto {
  low = 'low',
  medium = 'medium',
  high = 'high',
  critical = 'critical',
}

export class CreateComplaintDto {
  @ApiProperty({ example: 'Suresh Kumar' })
  @IsString()
  @IsNotEmpty()
  complainant_name: string;

  @ApiPropertyOptional({ example: '9876522222' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'suresh@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'facilities', description: 'Free-form category' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ example: 'Washroom near block B has a broken tap' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ enum: ComplaintPriorityDto, default: ComplaintPriorityDto.medium })
  @IsOptional()
  @IsEnum(ComplaintPriorityDto)
  priority?: ComplaintPriorityDto;

  @ApiPropertyOptional({ example: 1, description: 'employee_id to assign to immediately' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigned_to?: number;
}
