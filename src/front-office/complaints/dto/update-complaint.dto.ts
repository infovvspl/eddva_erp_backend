import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateComplaintDto } from './create-complaint.dto';

export class UpdateComplaintDto extends PartialType(OmitType(CreateComplaintDto, ['assigned_to', 'priority'] as const)) {}
