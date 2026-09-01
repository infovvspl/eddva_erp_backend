import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum FeeBasisDto {
  route = 'route',
  distance_slab = 'distance_slab',
  flat = 'flat',
}

export enum BillingCycleDto {
  monthly = 'monthly',
  quarterly = 'quarterly',
  annual = 'annual',
}

export class CreateFeePlanDto {
  @ApiProperty({ example: 'Monthly City Route' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: FeeBasisDto, example: FeeBasisDto.route })
  @IsEnum(FeeBasisDto)
  basis: FeeBasisDto;

  @ApiPropertyOptional({ example: 1, description: 'Required when basis=route' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  route_id?: number;

  @ApiProperty({ example: 1500 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: BillingCycleDto, example: BillingCycleDto.monthly })
  @IsEnum(BillingCycleDto)
  billing_cycle: BillingCycleDto;
}
