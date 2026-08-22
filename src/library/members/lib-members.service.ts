import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MemberQueryDto } from './dto/member-query.dto';

@Injectable()
export class LibMembersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMemberDto) {
    // Generate unique library_card_number
    const year = new Date().getFullYear();
    const count = await this.prisma.libMember.count();
    const library_card_number = `LIB-${year}-${String(count + 1).padStart(5, '0')}`;

    return this.prisma.libMember.create({
      data: {
        ...dto,
        member_type: dto.member_type as any,
        library_card_number,
      },
    });
  }

  async findAll(query: MemberQueryDto) {
    const { page = 1, limit = 20, type, status, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (type) where.member_type = type;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { library_card_number: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.libMember.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.libMember.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    return this.findOneOrFail(id);
  }

  async update(id: number, dto: UpdateMemberDto) {
    await this.findOneOrFail(id);
    return this.prisma.libMember.update({
      where: { member_id: id },
      data: dto as any,
    });
  }

  async getCurrentIssues(id: number) {
    await this.findOneOrFail(id);
    return this.prisma.libIssueRecord.findMany({
      where: {
        member_id: id,
        status: { in: ['issued', 'overdue'] },
      },
      include: {
        copy: { include: { book: true } },
      },
      orderBy: { due_date: 'asc' },
    });
  }

  async getFines(id: number) {
    await this.findOneOrFail(id);
    return this.prisma.libFine.findMany({
      where: { member_id: id },
      include: { payments: true },
      orderBy: { calculated_at: 'desc' },
    });
  }

  async findOneOrFail(id: number) {
    const member = await this.prisma.libMember.findUnique({
      where: { member_id: id },
    });
    if (!member) throw new NotFoundException(`Member #${id} not found`);
    return member;
  }
}
