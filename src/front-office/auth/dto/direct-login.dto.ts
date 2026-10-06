import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FrontOfficeDirectLoginDto {
  @ApiProperty({ example: 'front_desk_asha', description: 'Username or user email' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'FrontDesk#2026', description: 'User login password' })
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
