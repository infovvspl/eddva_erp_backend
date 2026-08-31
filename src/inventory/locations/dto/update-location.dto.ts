import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateLocationDto } from './create-location.dto';
import { InvStatusDto } from '../../categories/dto/update-category.dto';

export class UpdateLocationDto extends PartialType(CreateLocationDto) {
  @ApiPropertyOptional({ enum: InvStatusDto })
  @IsOptional()
  @IsEnum(InvStatusDto)
  status?: InvStatusDto;
}
