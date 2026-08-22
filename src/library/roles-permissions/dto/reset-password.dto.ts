import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetUserPasswordDto {
  @ApiProperty({ example: 'NewSecretPass#2026', description: 'New password for the assigned user account' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  new_password: string;
}
