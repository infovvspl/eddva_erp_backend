import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateEmployeeDto } from './create-employee.dto';
import { FoStatusDto } from '../../departments/dto/update-department.dto';

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {
  @ApiPropertyOptional({ enum: FoStatusDto })
  @IsOptional()
  @IsEnum(FoStatusDto)
  status?: FoStatusDto;
}
