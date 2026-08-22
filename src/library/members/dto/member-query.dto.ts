import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

enum MemberType {
  student = 'student',
  staff = 'staff',
  faculty = 'faculty',
}

enum MemberStatus {
  active = 'active',
  suspended = 'suspended',
  expired = 'expired',
}

export class MemberQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: MemberType })
  @IsOptional()
  @IsEnum(MemberType)
  type?: MemberType;

  @ApiPropertyOptional({ enum: MemberStatus })
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;

  @ApiPropertyOptional({ description: 'Search by name or library card number' })
  @IsOptional()
  @IsString()
  search?: string;
}
