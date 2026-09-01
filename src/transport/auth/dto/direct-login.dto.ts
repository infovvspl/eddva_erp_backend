import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransportDirectLoginDto {
  @ApiProperty({ example: 'dispatcher_asha', description: 'Username or user email' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'Dispatch#2026', description: 'User login password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
