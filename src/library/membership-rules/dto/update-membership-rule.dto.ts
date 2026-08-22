import { PartialType } from '@nestjs/swagger';
import { CreateMembershipRuleDto } from './create-membership-rule.dto';

export class UpdateMembershipRuleDto extends PartialType(CreateMembershipRuleDto) {}
