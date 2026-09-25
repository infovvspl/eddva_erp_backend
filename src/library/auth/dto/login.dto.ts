import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LibDirectLoginDto {
  @ApiProperty({ example: 'anita_lib', description: 'Username created by Institute Admin or email' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'LibraryPass#2026', description: 'Password created by Institute Admin' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({
    example: '',
    description:
      'Leave empty in almost all cases. Only needed when the same username exists in more than one institute (the API then answers 400 asking for it). An empty value is treated as omitted.',
  })
  @IsOptional()
  @IsString()
  institute_id?: string;
}
