import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SpItemStatus } from '@prisma/client';
import { CreateItemDto } from './create-item.dto';

export class UpdateItemDto extends PartialType(CreateItemDto) {
  @ApiPropertyOptional({ enum: SpItemStatus })
  @IsOptional()
  @IsEnum(SpItemStatus)
  status?: SpItemStatus;
}
