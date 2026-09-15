import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SpPartyStatus } from '@prisma/client';
import { CreateCustomerDto } from './create-customer.dto';

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
  @ApiPropertyOptional({ enum: SpPartyStatus })
  @IsOptional()
  @IsEnum(SpPartyStatus)
  status?: SpPartyStatus;
}
