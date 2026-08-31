import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { CreateHolderDto } from './create-holder.dto';
import { InvStatusDto } from '../../categories/dto/update-category.dto';

export class UpdateHolderDto extends PartialType(OmitType(CreateHolderDto, ['holder_type'] as const)) {
  @ApiPropertyOptional({ enum: InvStatusDto })
  @IsOptional()
  @IsEnum(InvStatusDto)
  status?: InvStatusDto;
}
