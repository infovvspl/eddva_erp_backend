import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateItemCategoryDto {
  @ApiProperty({ example: 'Raw Materials' })
  @IsString()
  @IsNotEmpty()
  categoryName: string;
}
