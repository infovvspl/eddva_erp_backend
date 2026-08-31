import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectIssueDto {
  @ApiProperty({ example: 'Requested quantity exceeds department budget for this term' })
  @IsString()
  @IsNotEmpty()
  rejection_reason: string;
}
