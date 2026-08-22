import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Fiction' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
