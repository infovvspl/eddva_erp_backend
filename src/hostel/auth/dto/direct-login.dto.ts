import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HostelDirectLoginDto {
  @ApiProperty({
    example: 'warden_riya',
    description: 'Username or user email',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    example: 'Hostel#2026',
    description: 'User login password',
  })
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
