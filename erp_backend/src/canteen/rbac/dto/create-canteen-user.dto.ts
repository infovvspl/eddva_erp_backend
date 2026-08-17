import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateCanteenUserDto {
  @ApiProperty({ example: 'John Doe', description: 'User full name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'canteen.user@eddva.com', description: 'User email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Password@123', description: 'Password (minimum 6 characters)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: 'canteen-role-uuid', description: 'Optional Canteen Role ID to assign to the user' })
  @IsOptional()
  @IsUUID()
  canteenRoleId?: string;

  @ApiPropertyOptional({ example: 'system-role-uuid', description: 'Optional System Role ID' })
  @IsOptional()
  @IsUUID()
  roleId?: string;
}
