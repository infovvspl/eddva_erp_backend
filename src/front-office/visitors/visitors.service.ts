import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FrontOfficeAuditService } from '../common/front-office-audit.service';
import { FO_ENTITY } from '../common/front-office-entities';
import { decryptIdProof, encryptIdProof, maskIdProof } from '../common/id-proof-crypto.util';
import { CreateVisitorDto } from './dto/create-visitor.dto';
import { UpdateVisitorDto } from './dto/update-visitor.dto';

@Injectable()
export class VisitorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FrontOfficeAuditService,
  ) {}

  /** Masks id_proof_number unless the caller holds sensitive-view; logs the reveal when granted. */
  async serialize<T extends { visitor_id: number; id_proof_number: string | null }>(
    visitor: T,
    canViewSensitive: boolean,
    viewerId?: string,
  ): Promise<T> {
    if (!visitor.id_proof_number) return visitor;
    if (!canViewSensitive) {
      return { ...visitor, id_proof_number: maskIdProof(decryptIdProof(visitor.id_proof_number)) };
    }
    await this.audit.log({
      userId: viewerId,
      entityType: FO_ENTITY.VISITOR,
      entityId: String(visitor.visitor_id),
      action: 'view_sensitive_id_proof',
    });
    return { ...visitor, id_proof_number: decryptIdProof(visitor.id_proof_number) };
  }

  async findDuplicate(phone?: string, email?: string) {
    if (!phone && !email) return null;
    return this.prisma.frontOfficeVisitor.findFirst({
      where: { OR: [phone ? { phone } : undefined, email ? { email } : undefined].filter(Boolean) as any },
    });
  }

  async create(dto: CreateVisitorDto, actorId: string | undefined, canViewSensitive: boolean) {
    const duplicate = await this.findDuplicate(dto.phone, dto.email);
    if (duplicate) {
      throw new ConflictException(
        `A visitor with this ${duplicate.phone === dto.phone ? 'phone number' : 'email'} already exists (visitor_id ${duplicate.visitor_id}). Update the existing record instead of creating a duplicate.`,
      );
    }

    const visitor = await this.prisma.frontOfficeVisitor.create({
      data: {
        full_name: dto.full_name,
        phone: dto.phone,
        email: dto.email,
        id_proof_type: dto.id_proof_type,
        id_proof_number: dto.id_proof_number ? encryptIdProof(dto.id_proof_number) : undefined,
        photo_url: dto.photo_url,
        organization: dto.organization,
        created_by: actorId,
      },
    });

    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.VISITOR,
      entityId: String(visitor.visitor_id),
      action: 'create',
    });
    // create/update responses must never leak the raw ciphertext blob — mask/decrypt like any other read path
    return this.serialize(visitor, canViewSensitive, actorId);
  }

  /** Used internally by check-in / appointment-conversion flows to avoid creating duplicate visitor masters. */
  async findOrCreate(
    data: { full_name: string; phone?: string; email?: string; id_proof_type?: string; id_proof_number?: string; photo_url?: string; organization?: string },
    actorId?: string,
  ) {
    const existing = await this.findDuplicate(data.phone, data.email);
    if (existing) return existing;

    return this.prisma.frontOfficeVisitor.create({
      data: {
        full_name: data.full_name,
        phone: data.phone,
        email: data.email,
        id_proof_type: data.id_proof_type,
        id_proof_number: data.id_proof_number ? encryptIdProof(data.id_proof_number) : undefined,
        photo_url: data.photo_url,
        organization: data.organization,
        created_by: actorId,
      },
    });
  }

  async findAll(params: { search?: string; page?: number; limit?: number }, canViewSensitive: boolean, viewerId?: string) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 25;

    const where: any = {};
    if (params.search) {
      where.OR = [
        { full_name: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { organization: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.frontOfficeVisitor.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.frontOfficeVisitor.count({ where }),
    ]);

    const data = await Promise.all(rows.map((v) => this.serialize(v, canViewSensitive, viewerId)));
    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number, canViewSensitive: boolean, viewerId?: string) {
    const visitor = await this.prisma.frontOfficeVisitor.findUnique({ where: { visitor_id: id } });
    if (!visitor) throw new NotFoundException(`Visitor #${id} not found`);
    return this.serialize(visitor, canViewSensitive, viewerId);
  }

  async update(id: number, dto: UpdateVisitorDto, actorId: string | undefined, canViewSensitive: boolean) {
    const existing = await this.prisma.frontOfficeVisitor.findUnique({ where: { visitor_id: id } });
    if (!existing) throw new NotFoundException(`Visitor #${id} not found`);

    if ((dto.phone && dto.phone !== existing.phone) || (dto.email && dto.email !== existing.email)) {
      const duplicate = await this.findDuplicate(dto.phone !== existing.phone ? dto.phone : undefined, dto.email !== existing.email ? dto.email : undefined);
      if (duplicate && duplicate.visitor_id !== id) {
        throw new ConflictException(`Another visitor already uses this ${duplicate.phone === dto.phone ? 'phone number' : 'email'} (visitor_id ${duplicate.visitor_id})`);
      }
    }

    const updated = await this.prisma.frontOfficeVisitor.update({
      where: { visitor_id: id },
      data: {
        full_name: dto.full_name,
        phone: dto.phone,
        email: dto.email,
        id_proof_type: dto.id_proof_type,
        id_proof_number: dto.id_proof_number ? encryptIdProof(dto.id_proof_number) : undefined,
        photo_url: dto.photo_url,
        organization: dto.organization,
      },
    });

    await this.audit.log({ userId: actorId, entityType: FO_ENTITY.VISITOR, entityId: String(id), action: 'update' });
    return this.serialize(updated, canViewSensitive, actorId);
  }

  async getVisits(id: number) {
    await this.assertExists(id);
    return this.prisma.frontOfficeVisitorLog.findMany({
      where: { visitor_id: id },
      include: { host_employee: { select: { employee_id: true, name: true, department_id: true } }, appointment: true },
      orderBy: { check_in_time: 'desc' },
    });
  }

  async getAppointmentHistory(id: number) {
    await this.assertExists(id);
    return this.prisma.frontOfficeAppointment.findMany({
      where: { visitor_id: id },
      include: { host_employee: { select: { employee_id: true, name: true } }, department: { select: { name: true } } },
      orderBy: { appointment_date: 'desc' },
    });
  }

  private async assertExists(id: number) {
    const visitor = await this.prisma.frontOfficeVisitor.findUnique({ where: { visitor_id: id } });
    if (!visitor) throw new NotFoundException(`Visitor #${id} not found`);
    return visitor;
  }
}
