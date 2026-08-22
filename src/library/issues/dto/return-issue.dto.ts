import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum CopyCondition {
  new = 'new',
  good = 'good',
  worn = 'worn',
  damaged = 'damaged',
}

export class ReturnIssueDto {
  @ApiPropertyOptional({ example: 1, description: 'user_id of librarian handling the return (received_by)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  received_by?: number;

  @ApiPropertyOptional({ example: 1, description: 'user_id of librarian handling the return (returned_to)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  returned_to?: number;

  @ApiPropertyOptional({ enum: CopyCondition, example: 'good', description: 'Condition of physical book copy upon return' })
  @IsOptional()
  @IsEnum(CopyCondition)
  returned_condition?: CopyCondition;
}
