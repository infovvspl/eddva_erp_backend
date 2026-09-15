import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SalesPurchaseDirectLoginDto {
  @ApiProperty({
    example: 'purchase_clerk_raj',
    description: 'Username or user email',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    example: 'PurchaseClerk#2026',
    description: 'User login password',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
