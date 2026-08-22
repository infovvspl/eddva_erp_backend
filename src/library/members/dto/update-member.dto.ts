import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { CreateMemberDto } from './create-member.dto';

export enum MemberStatus {
  active = 'active',
  suspended = 'suspended',
  expired = 'expired',
}

export class UpdateMemberDto extends PartialType(CreateMemberDto) {
  @ApiPropertyOptional({ enum: MemberStatus })
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;
}
