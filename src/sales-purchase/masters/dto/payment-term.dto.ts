import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreatePaymentTermDto {
  @ApiProperty({ example: 'Net 30' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  term_name: string;

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(0)
  @Max(3650)
  days: number;
}

export class UpdatePaymentTermDto extends PartialType(CreatePaymentTermDto) {}
