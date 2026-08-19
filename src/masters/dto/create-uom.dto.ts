import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateUomDto {
  @ApiProperty({ example: 'Pieces' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'PCS' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
