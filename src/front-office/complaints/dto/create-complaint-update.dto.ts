import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateComplaintUpdateDto {
  @ApiProperty({ example: 'Plumber dispatched, expected fix by EOD' })
  @IsString()
  @IsNotEmpty()
  notes: string;
}
