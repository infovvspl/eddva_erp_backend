import { IsEnum, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum AttachmentEntityTypeDto {
  visitor = 'visitor',
  enquiry = 'enquiry',
  complaint = 'complaint',
}

export class CreateAttachmentDto {
  @ApiProperty({ enum: AttachmentEntityTypeDto })
  @IsEnum(AttachmentEntityTypeDto)
  entity_type: AttachmentEntityTypeDto;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  entity_id: number;
}
