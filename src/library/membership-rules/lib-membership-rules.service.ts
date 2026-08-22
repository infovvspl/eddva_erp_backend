import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMembershipRuleDto } from './dto/create-membership-rule.dto';
import { UpdateMembershipRuleDto } from './dto/update-membership-rule.dto';

@Injectable()
export class LibMembershipRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMembershipRuleDto) {
    const existing = await this.prisma.libMembershipRule.findUnique({
      where: { member_type: dto.member_type as any },
    });
    if (existing) {
      throw new ConflictException(
        `A rule for member_type '${dto.member_type}' already exists. Use PATCH to update it.`,
      );
    }
    return this.prisma.libMembershipRule.create({ data: dto as any });
  }

  async findAll() {
    return this.prisma.libMembershipRule.findMany({
      orderBy: { member_type: 'asc' },
    });
  }

  async findByMemberType(memberType: string) {
    const rule = await this.prisma.libMembershipRule.findUnique({
      where: { member_type: memberType as any },
    });
    if (!rule) throw new NotFoundException(`No rule found for member_type '${memberType}'`);
    return rule;
  }

  async update(id: number, dto: UpdateMembershipRuleDto) {
    await this.findOneOrFail(id);
    return this.prisma.libMembershipRule.update({
      where: { rule_id: id },
      data: dto as any,
    });
  }

  private async findOneOrFail(id: number) {
    const rule = await this.prisma.libMembershipRule.findUnique({
      where: { rule_id: id },
    });
    if (!rule) throw new NotFoundException(`Membership rule #${id} not found`);
    return rule;
  }
}
