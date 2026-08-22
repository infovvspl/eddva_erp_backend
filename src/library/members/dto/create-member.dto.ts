import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum MemberType {
  student = 'student',
  staff = 'staff',
  faculty = 'faculty',
}

export class CreateMemberDto {
  @ApiProperty({ example: 'STU-2024-001', description: 'FK to Student/Staff master' })
  @IsOptional()
  @IsString()
  external_ref_id?: string;

  @ApiProperty({ example: 'Arjun Kumar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ enum: MemberType })
  @IsEnum(MemberType)
  member_type: MemberType;
}
