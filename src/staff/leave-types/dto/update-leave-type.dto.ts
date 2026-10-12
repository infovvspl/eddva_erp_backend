import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateLeaveTypeDto } from './create-leave-type.dto';

export class UpdateLeaveTypeDto extends PartialType(CreateLeaveTypeDto) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
