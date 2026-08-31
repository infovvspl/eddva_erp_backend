import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InventoryDirectLoginDto {
  @ApiProperty({ example: 'store_keeper_raj', description: 'Username or user email' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'StoreKeeper#2026', description: 'User login password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
