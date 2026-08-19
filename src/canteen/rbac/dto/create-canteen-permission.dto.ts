import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateCanteenPermissionDto {
  @ApiProperty({ example: 'canteen.discount.approve' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^canteen\.[a-z0-9_.]+\.[a-z0-9_.]+$/, {
    message: 'key must start with canteen. and follow dot notation e.g. canteen.discount.approve',
  })
  key: string;

  @ApiProperty({ example: 'Approve Order Discount' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Grants authority to apply special discounts to canteen orders' })
  @IsOptional()
  @IsString()
  description?: string;
}
