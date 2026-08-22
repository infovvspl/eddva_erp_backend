import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateIssueDto {
  @ApiProperty({ example: 1, description: 'copy_id of the physical copy to issue' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  copy_id: number;

  @ApiProperty({ example: 1, description: 'member_id of the borrower' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  member_id: number;

  @ApiProperty({ example: 1, description: 'user_id of the librarian issuing the book' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  issued_by: number;
}
