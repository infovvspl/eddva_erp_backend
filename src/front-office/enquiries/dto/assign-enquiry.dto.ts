import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AssignEnquiryDto {
  @ApiProperty({ example: 1, description: 'employee_id to assign/reassign the enquiry to' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigned_to: number;

  @ApiPropertyOptional({ example: 'Reassigning to the admissions specialist' })
  @IsOptional()
  @IsString()
  reason?: string;
}
