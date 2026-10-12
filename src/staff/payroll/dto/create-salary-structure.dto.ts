import { IsDateString, IsInt, IsNumber, IsObject, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSalaryStructureDto {
  @ApiProperty({ example: 1, description: 'staff_id' })
  @IsInt()
  staff_id: number;

  @ApiProperty({ example: 40000 })
  @IsNumber()
  @Min(0)
  basic_salary: number;

  @ApiPropertyOptional({
    example: { hra: 8000, da: 2000 },
    description: 'Arbitrary allowance components, summed for gross pay',
  })
  @IsOptional()
  @IsObject()
  allowances?: Record<string, number>;

  @ApiProperty({ example: '2026-11-01', description: 'When this structure takes effect; closes any prior open structure for this staff member the day before' })
  @IsDateString()
  effective_from: string;
}
