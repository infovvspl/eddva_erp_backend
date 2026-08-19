import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreatePaymentTermDto {
  @ApiProperty({ example: 'Net 30' })
  @IsString()
  @IsNotEmpty()
  termName: string;

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(0)
  days: number;
}
