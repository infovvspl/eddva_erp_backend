import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SportsDirectLoginDto {
  @ApiProperty({ example: 'coach_john', description: 'Username or user email' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'SportsPass#2026', description: 'User login password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
