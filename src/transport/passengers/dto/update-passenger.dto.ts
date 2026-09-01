import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { CreatePassengerDto } from './create-passenger.dto';

export enum PassengerStatusDto {
  active = 'active',
  inactive = 'inactive',
}

export class UpdatePassengerDto extends PartialType(OmitType(CreatePassengerDto, ['type'] as const)) {
  @ApiPropertyOptional({ enum: PassengerStatusDto })
  @IsOptional()
  @IsEnum(PassengerStatusDto)
  status?: PassengerStatusDto;
}
