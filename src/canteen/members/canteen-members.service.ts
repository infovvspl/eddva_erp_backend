import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CreateCanteenMemberDto } from './dto/create-canteen-member.dto';
import { UpdateCanteenMemberDto } from './dto/update-canteen-member.dto';
import { CanteenMemberType } from '@prisma/client';

@Injectable()
export class CanteenMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getMembers(params: {
    page?: number;
    limit?: number;
    search?: string;
    memberType?: CanteenMemberType;
    externalRefId?: string;
    sort?: string;
  }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 25;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { idCardBarcode: { contains: params.search, mode: 'insensitive' } },
        { externalRefId: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.memberType) {
      where.memberType = params.memberType;
    }

    if (params.externalRefId) {
      where.externalRefId = params.externalRefId;
    }

    const orderBy: any = {};
    if (params.sort) {
      const [field, direction] = params.sort.split(':');
      orderBy[field] = direction?.toLowerCase() === 'desc' ? 'desc' : 'asc';
    } else {
      orderBy.name = 'asc';
    }

    const [total, data] = await Promise.all([
      this.prisma.canteenMember.count({ where }),
      this.prisma.canteenMember.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: { wallet: true },
      }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMemberById(id: string) {
    const member = await this.prisma.canteenMember.findUnique({
      where: { id },
      include: { wallet: true },
    });
    if (!member) {
      throw new NotFoundException('Canteen member not found.');
    }
    return member;
  }

  async getMemberByBarcode(barcode: string) {
    const member = await this.prisma.canteenMember.findUnique({
      where: { idCardBarcode: barcode },
      include: { wallet: true },
    });
    if (!member) {
      throw new NotFoundException(`Member with barcode '${barcode}' not found.`);
    }
    return member;
  }

  async createMember(dto: CreateCanteenMemberDto, actorUserId?: string) {
    const existingBarcode = await this.prisma.canteenMember.findUnique({
      where: { idCardBarcode: dto.idCardBarcode },
    });
    if (existingBarcode) {
      throw new ConflictException(`Member with barcode '${dto.idCardBarcode}' already exists.`);
    }

    const member = await this.prisma.$transaction(async (tx) => {
      const m = await tx.canteenMember.create({
        data: {
          name: dto.name,
          memberType: dto.memberType ?? CanteenMemberType.STUDENT,
          idCardBarcode: dto.idCardBarcode,
          externalRefId: dto.externalRefId || null,
        },
      });

      // Auto-create wallet with initial 0 balance
      await tx.canteenWallet.create({
        data: {
          memberId: m.id,
          balance: 0,
          status: 'ACTIVE',
        },
      });

      return tx.canteenMember.findUnique({
        where: { id: m.id },
        include: { wallet: true },
      });
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenMember',
      entityId: member!.id,
      action: 'Canteen Member Created',
      metadata: { name: member!.name, barcode: member!.idCardBarcode },
    });

    return member;
  }

  async updateMember(id: string, dto: UpdateCanteenMemberDto, actorUserId?: string) {
    const member = await this.getMemberById(id);

    if (dto.idCardBarcode && dto.idCardBarcode !== member.idCardBarcode) {
      const existing = await this.prisma.canteenMember.findUnique({
        where: { idCardBarcode: dto.idCardBarcode },
      });
      if (existing) {
        throw new ConflictException(`Barcode '${dto.idCardBarcode}' is already assigned to another member.`);
      }
    }

    const updated = await this.prisma.canteenMember.update({
      where: { id },
      data: {
        name: dto.name ?? member.name,
        memberType: dto.memberType ?? member.memberType,
        idCardBarcode: dto.idCardBarcode ?? member.idCardBarcode,
        externalRefId: dto.externalRefId !== undefined ? dto.externalRefId : member.externalRefId,
      },
      include: { wallet: true },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenMember',
      entityId: id,
      action: 'Canteen Member Updated',
      metadata: { name: updated.name, barcode: updated.idCardBarcode },
    });

    return updated;
  }

  async deleteMember(id: string, actorUserId?: string) {
    const member = await this.prisma.canteenMember.findUnique({
      where: { id },
      include: { orders: true, wallet: { include: { transactions: true } } },
    });
    if (!member) {
      throw new NotFoundException('Canteen member not found.');
    }

    if (member.orders.length > 0 || (member.wallet && member.wallet.transactions.length > 0)) {
      throw new ConflictException(
        `Cannot delete member '${member.name}' because they have active order or wallet financial history.`,
      );
    }

    await this.prisma.canteenWallet.deleteMany({ where: { memberId: id } });
    await this.prisma.canteenMember.delete({ where: { id } });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenMember',
      entityId: id,
      action: 'Canteen Member Deleted',
      metadata: { name: member.name },
    });

    return { message: `Member '${member.name}' deleted successfully.` };
  }
}
