import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateHouseDto {
  @ApiProperty({ example: 'Falcon House' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: '#FF2233' })
  @IsOptional()
  @IsString()
  color_code?: string;

  @ApiPropertyOptional({ example: 1, description: 'Staff ID of the House Master' })
  @IsOptional()
  @IsInt()
  house_master_id?: number;

  @ApiPropertyOptional({ example: 'Fly High, Soar Together' })
  @IsOptional()
  @IsString()
  motto?: string;
}

export class UpdateHouseDto extends PartialType(CreateHouseDto) {}
