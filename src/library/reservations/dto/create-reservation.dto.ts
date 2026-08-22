import { IsInt, IsOptional, Min } from 'class-validator';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateReservationDto {
  @ApiHideProperty()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  book_id?: number;

  @ApiProperty({ example: 1, description: 'member_id of the borrower placing the hold' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  member_id: number;
}
