import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountNature } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAccountGroupDto {
  @ApiProperty({ example: 'Current Assets' })
  @IsString()
  @IsNotEmpty()
  groupName: string;

  @ApiPropertyOptional({ description: 'Parent group id, for a nested sub-group' })
  @IsOptional()
  @IsUUID()
  parentGroupId?: string;

  @ApiProperty({ enum: AccountNature, example: AccountNature.ASSET })
  @IsEnum(AccountNature)
  nature: AccountNature;
}
