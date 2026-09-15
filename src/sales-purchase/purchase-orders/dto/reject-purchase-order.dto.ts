import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApprovePurchaseOrderDto {
  @ApiPropertyOptional({ example: 'Approved — within budget' })
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class RejectPurchaseOrderDto {
  @ApiProperty({
    example: 'Unit price exceeds last approved rate by more than 10%',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
