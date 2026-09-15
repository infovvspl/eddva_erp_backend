import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Status } from '@prisma/client';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Main Store' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: 'Ground Floor, Admin Block' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Set as the institute default warehouse (unsets any previous default)',
  })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {
  @ApiPropertyOptional({ enum: Status })
  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}
