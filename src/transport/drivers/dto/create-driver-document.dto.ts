import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDriverDocumentDto {
  @ApiProperty({ example: 'medical_certificate' })
  @IsString()
  @IsNotEmpty()
  doc_type: string;

  @ApiProperty({ example: 'https://storage/doc.pdf' })
  @IsString()
  @IsNotEmpty()
  doc_url: string;

  @ApiPropertyOptional({ example: '2027-01-01' })
  @IsOptional()
  @IsDateString()
  expiry_date?: string;
}
