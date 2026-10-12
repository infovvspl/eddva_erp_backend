import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum RelieveReasonDto {
  resigned = 'resigned',
  terminated = 'terminated',
}

export class RelieveStaffMemberDto {
  @ApiProperty({ enum: RelieveReasonDto, example: RelieveReasonDto.resigned })
  @IsEnum(RelieveReasonDto)
  status: RelieveReasonDto;

  @ApiProperty({ example: '2026-12-31' })
  @IsDateString()
  relieved_on: string;

  @ApiPropertyOptional({ example: 'Moved to another institute' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  status_reason?: string;
}

export class ReinstateStaffMemberDto {
  @ApiProperty({ example: '2027-01-15' })
  @IsDateString()
  date_of_joining: string;
}
