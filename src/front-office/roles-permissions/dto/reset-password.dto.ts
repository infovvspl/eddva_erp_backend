import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetFrontOfficeUserPasswordDto {
  @ApiProperty({ example: 'NewSecretPass#2026' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  new_password: string;
}
