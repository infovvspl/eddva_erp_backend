import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { CreateMembershipRuleDto } from './dto/create-membership-rule.dto';
import { UpdateMembershipRuleDto } from './dto/update-membership-rule.dto';

@Injectable()
export class LibMembershipRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(instituteId: string, dto: CreateMembershipRuleDto) {
    const institute_id = requireInstituteId(instituteId);
    const existing = await this.prisma.libMembershipRule.findFirst({
      where: { institute_id, member_type: dto.member_type as any },
    });
    if (existing) {
      throw new ConflictException(
        `A rule for member_type '${dto.member_type}' already exists. Use PATCH to update it.`,
      );
    }
    return this.prisma.libMembershipRule.create({ data: { ...(dto as any), institute_id } });
  }

  async findAll(instituteId: string) {
    return this.prisma.libMembershipRule.findMany({
      where: { institute_id: requireInstituteId(instituteId) },
      orderBy: { member_type: 'asc' },
    });
  }

  async findByMemberType(instituteId: string, memberType: string) {
    const rule = await this.prisma.libMembershipRule.findFirst({
      where: { institute_id: requireInstituteId(instituteId), member_type: memberType as any },
    });
    if (!rule) throw new NotFoundException(`No rule found for member_type '${memberType}'`);
    return rule;
  }

  async update(instituteId: string, id: number, dto: UpdateMembershipRuleDto) {
    await this.findOneOrFail(instituteId, id);
    return this.prisma.libMembershipRule.update({
      where: { rule_id: id },
      data: dto as any,
    });
  }

  private async findOneOrFail(instituteId: string, id: number) {
    const rule = await this.prisma.libMembershipRule.findFirst({
      where: { rule_id: id, institute_id: requireInstituteId(instituteId) },
    });
    if (!rule) throw new NotFoundException(`Membership rule #${id} not found`);
    return rule;
  }
}
