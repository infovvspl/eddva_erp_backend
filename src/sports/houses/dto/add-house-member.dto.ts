import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SportsMembershipStatus } from '@prisma/client';

export class AddHouseMemberDto {
  @ApiProperty({ example: 1, description: 'Participant ID' })
  @IsInt()
  @IsNotEmpty()
  participant_id: number;

  @ApiProperty({ example: '2026-27', description: 'Academic year string' })
  @IsString()
  @IsNotEmpty()
  academic_year: string;

  @ApiPropertyOptional({ enum: SportsMembershipStatus, example: SportsMembershipStatus.active })
  @IsOptional()
  @IsEnum(SportsMembershipStatus)
  status?: SportsMembershipStatus;
}
