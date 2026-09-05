import { PartialType } from '@nestjs/swagger';
import { CreateAccountGroupDto } from './create-account-group.dto';

export class UpdateAccountGroupDto extends PartialType(CreateAccountGroupDto) {}
