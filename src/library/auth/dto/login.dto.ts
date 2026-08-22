import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LibDirectLoginDto {
  @ApiProperty({ example: 'anita_lib', description: 'Username created by Institute Admin or email' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'LibraryPass#2026', description: 'Password created by Institute Admin' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
