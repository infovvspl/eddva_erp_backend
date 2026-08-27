import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateEnquiryDto } from './create-enquiry.dto';

export class UpdateEnquiryDto extends PartialType(OmitType(CreateEnquiryDto, ['assigned_to'] as const)) {}
