import { PartialType } from '@nestjs/swagger';
import { CreateStaffDepartmentDto } from './create-department.dto';

export class UpdateStaffDepartmentDto extends PartialType(
  CreateStaffDepartmentDto,
) {}
