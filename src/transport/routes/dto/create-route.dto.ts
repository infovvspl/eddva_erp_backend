import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRouteDto {
  @ApiProperty({ example: 'Downtown Express' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'City Center' })
  @IsString()
  @IsNotEmpty()
  start_location: string;

  @ApiProperty({ example: 'Campus' })
  @IsString()
  @IsNotEmpty()
  end_location: string;
}
