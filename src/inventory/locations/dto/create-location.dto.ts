import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum LocationTypeDto {
  store = 'store',
  department = 'department',
  classroom = 'classroom',
  lab = 'lab',
}

export class CreateLocationDto {
  @ApiProperty({ example: 'Main Store' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: LocationTypeDto, example: LocationTypeDto.store })
  @IsEnum(LocationTypeDto)
  type: LocationTypeDto;
}
