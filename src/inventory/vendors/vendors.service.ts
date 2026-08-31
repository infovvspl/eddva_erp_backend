import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryAuditService } from '../common/inventory-audit.service';
import { INV_ENTITY } from '../common/inventory-entities';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: InventoryAuditService,
  ) {}

  async create(dto: CreateVendorDto, actorId?: string) {
    const vendor = await this.prisma.invVendor.create({ data: dto });
    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.VENDOR, entityId: String(vendor.vendor_id), action: 'create' });
    return vendor;
  }

  async findAll(search?: string) {
    return this.prisma.invVendor.findMany({
      where: search
        ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] }
        : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const vendor = await this.prisma.invVendor.findUnique({
      where: { vendor_id: id },
      include: { item_vendors: { include: { item: { select: { item_id: true, name: true, item_code: true } } } } },
    });
    if (!vendor) throw new NotFoundException(`Vendor #${id} not found`);
    return vendor;
  }

  private async assertExists(id: number) {
    const vendor = await this.prisma.invVendor.findUnique({ where: { vendor_id: id } });
    if (!vendor) throw new NotFoundException(`Vendor #${id} not found`);
    return vendor;
  }

  async update(id: number, dto: UpdateVendorDto, actorId?: string) {
    const existing = await this.assertExists(id);
    const updated = await this.prisma.invVendor.update({
      where: { vendor_id: id },
      data: { name: dto.name, contact_phone: dto.contact_phone, email: dto.email, address: dto.address, status: dto.status as any },
    });
    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.VENDOR, entityId: String(id), action: 'update', oldStatus: existing.status, newStatus: updated.status });
    return updated;
  }
}
