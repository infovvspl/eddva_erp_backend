import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ClassWiseReportQueryDto {
  @ApiProperty({ example: '2026-27' })
  @IsString()
  @IsNotEmpty()
  academic_year: string;
}
