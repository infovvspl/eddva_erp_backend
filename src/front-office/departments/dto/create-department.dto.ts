import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Admissions' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;
}
