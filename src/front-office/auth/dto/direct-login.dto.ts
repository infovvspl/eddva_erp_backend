import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FrontOfficeDirectLoginDto {
  @ApiProperty({ example: 'front_desk_asha', description: 'Username or user email' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'FrontDesk#2026', description: 'User login password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
