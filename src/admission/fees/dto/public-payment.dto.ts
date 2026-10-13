import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRazorpayOrderDto {
  @ApiProperty({ example: 'ADM-2027-00042', description: 'The application_number shown on the payment link/receipt — proves the caller actually has the link' })
  @IsString()
  @IsNotEmpty()
  application_number: string;
}

export class VerifyRazorpayPaymentDto extends CreateRazorpayOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  razorpay_order_id: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  razorpay_payment_id: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  razorpay_signature: string;
}
