import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateApprovalRuleDto {
  @ApiProperty({ example: 'Above 50k requires Finance Head' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 50000 })
  @IsNumber()
  @Min(0)
  min_amount: number;

  @ApiPropertyOptional({
    example: 200000,
    description: 'Omit for "and above" (no upper bound)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  max_amount?: number;

  @ApiPropertyOptional({
    example: 2,
    description:
      'SalesPurchaseDynamicRole role_id required to approve POs in this band; omit to allow any user holding purchase_order.approve',
  })
  @IsOptional()
  @IsInt()
  approver_role_id?: number;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Evaluation/sign-off order when multiple bands overlap for a very large PO',
  })
  @IsOptional()
  @IsInt()
  sequence?: number;
}

export class UpdateApprovalRuleDto extends PartialType(CreateApprovalRuleDto) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
