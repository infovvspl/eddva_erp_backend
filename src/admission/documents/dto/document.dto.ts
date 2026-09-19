import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AdmissionDocumentType } from '@prisma/client';

export class UploadDocumentDto {
  @ApiProperty({ enum: AdmissionDocumentType })
  @IsEnum(AdmissionDocumentType)
  document_type: AdmissionDocumentType;
}

export class RejectDocumentDto {
  @ApiProperty({ example: 'Image is blurred — please re-upload a clear scan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
