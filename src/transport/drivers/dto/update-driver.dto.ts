import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateDriverDto } from './create-driver.dto';

export enum DriverStatusDto {
  active = 'active',
  on_leave = 'on_leave',
  inactive = 'inactive',
}

export class UpdateDriverDto extends PartialType(CreateDriverDto) {
  @ApiPropertyOptional({ enum: DriverStatusDto })
  @IsOptional()
  @IsEnum(DriverStatusDto)
  status?: DriverStatusDto;
}
