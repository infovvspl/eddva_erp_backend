import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { CreateItemDto } from './create-item.dto';
import { InvStatusDto } from '../../categories/dto/update-category.dto';

export class UpdateItemDto extends PartialType(OmitType(CreateItemDto, ['item_type'] as const)) {
  @ApiPropertyOptional({ enum: InvStatusDto })
  @IsOptional()
  @IsEnum(InvStatusDto)
  status?: InvStatusDto;
}
