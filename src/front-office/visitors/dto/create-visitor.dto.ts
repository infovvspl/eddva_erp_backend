import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVisitorDto {
  @ApiProperty({ example: 'Rahul Verma' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  full_name: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'rahul.verma@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Aadhaar' })
  @IsOptional()
  @IsString()
  id_proof_type?: string;

  @ApiPropertyOptional({ example: '1234-5678-9012', description: 'Encrypted at rest; masked in list/read responses unless the caller holds front_office.visitor.sensitive_view' })
  @IsOptional()
  @IsString()
  id_proof_number?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/photos/visitor1.jpg' })
  @IsOptional()
  @IsString()
  photo_url?: string;

  @ApiPropertyOptional({ example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  organization?: string;
}
