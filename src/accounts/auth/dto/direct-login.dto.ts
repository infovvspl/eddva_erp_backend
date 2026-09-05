import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AccountsDirectLoginDto {
  @ApiProperty({ example: 'accountant_raj', description: 'Username or user email' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'Accountant#2026', description: 'User login password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
