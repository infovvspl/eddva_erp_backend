import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({
    example: '',
    description:
      'Leave empty in almost all cases. Only needed when the same username exists in more than one institute (the API then answers 400 asking for it). An empty value is treated as omitted.',
  })
  @IsOptional()
  @IsString()
  institute_id?: string;
}
