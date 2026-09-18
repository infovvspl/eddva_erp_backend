import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CanteenDirectLoginDto {
  @ApiProperty({ example: 'counter_staff_priya', description: 'Username or user email' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'CounterStaff#2026', description: 'User login password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
