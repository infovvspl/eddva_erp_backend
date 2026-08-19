import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsArray } from 'class-validator';

export class CreateCanteenRoleDto {
  @ApiProperty({ example: 'CANTEEN_SUPERVISOR', description: 'Unique name of the Canteen role' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Supervises daily canteen counters and inventory' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: ['canteen.order.view', 'canteen.shift.view'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];
}
