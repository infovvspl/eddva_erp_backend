import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RenewIssueDto {
  @ApiProperty({ example: 1, description: 'user_id of librarian processing the renewal' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  renewed_by: number;
}
