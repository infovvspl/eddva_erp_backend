import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SpPartyStatus } from '@prisma/client';

export class QueryCustomerDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Matches customer_code, customer_name, gstin',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: SpPartyStatus })
  @IsOptional()
  @IsEnum(SpPartyStatus)
  status?: SpPartyStatus;

  @ApiPropertyOptional({
    enum: ['customer_name', 'customer_code', 'created_at'],
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}
