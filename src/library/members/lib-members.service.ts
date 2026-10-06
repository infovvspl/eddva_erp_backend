import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MemberQueryDto } from './dto/member-query.dto';

@Injectable()
export class LibMembersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(instituteId: string, dto: CreateMemberDto) {
    const institute_id = requireInstituteId(instituteId);
    // Card numbers run per institute, matching the per-institute unique key.
    const year = new Date().getFullYear();
    const count = await this.prisma.libMember.count({ where: { institute_id } });
    const library_card_number = `LIB-${year}-${String(count + 1).padStart(5, '0')}`;

    return this.prisma.libMember.create({
      data: {
        ...dto,
        member_type: dto.member_type as any,
        library_card_number,
        institute_id,
      },
    });
  }

  async findAll(instituteId: string, query: MemberQueryDto) {
    const institute_id = requireInstituteId(instituteId);
    const { page = 1, limit = 20, type, status, search } = query;
    const skip = (page - 1) * limit;

    const where: any = { institute_id };
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

  async findOne(instituteId: string, id: number) {
    return this.findOneOrFail(instituteId, id);
  }

  async update(instituteId: string, id: number, dto: UpdateMemberDto) {
    await this.findOneOrFail(instituteId, id);
    return this.prisma.libMember.update({
      where: { member_id: id },
      data: dto as any,
    });
  }

  async getCurrentIssues(instituteId: string, id: number) {
    await this.findOneOrFail(instituteId, id);
    return this.prisma.libIssueRecord.findMany({
      where: {
        member_id: id,
        institute_id: instituteId,
        status: { in: ['issued', 'overdue'] },
      },
      include: {
        copy: { include: { book: true } },
      },
      orderBy: { due_date: 'asc' },
    });
  }

  async getFines(instituteId: string, id: number) {
    await this.findOneOrFail(instituteId, id);
    return this.prisma.libFine.findMany({
      where: { member_id: id, institute_id: instituteId },
      include: { payments: true },
      orderBy: { calculated_at: 'desc' },
    });
  }

  async findOneOrFail(instituteId: string, id: number) {
    const member = await this.prisma.libMember.findFirst({
      where: { member_id: id, institute_id: requireInstituteId(instituteId) },
    });
    if (!member) throw new NotFoundException(`Member #${id} not found`);
    return member;
  }
}
