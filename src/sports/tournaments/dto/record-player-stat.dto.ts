import { IsInt, IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecordPlayerStatDto {
  @ApiProperty({ example: 1, description: 'Participant ID' })
  @IsInt()
  @IsNotEmpty()
  participant_id: number;

  @ApiProperty({ example: 'goals', description: 'goals, runs, points, time, distance' })
  @IsString()
  @IsNotEmpty()
  stat_type: string;

  @ApiProperty({ example: 2.0, description: 'Numeric stat value' })
  @IsNumber()
  @IsNotEmpty()
  stat_value: number;
}
