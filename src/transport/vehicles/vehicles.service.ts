import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TransportAuditService } from '../common/transport-audit.service';
import { TRANSPORT_ENTITY } from '../common/transport-entities';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: TransportAuditService,
  ) {}

  async create(instituteId: string, dto: CreateVehicleDto, actorId?: string) {
    const existing = await this.prisma.transportVehicle.findUnique({
      where: { institute_id_registration_number: { institute_id: instituteId, registration_number: dto.registration_number } },
    });
    if (existing) throw new ConflictException(`Vehicle "${dto.registration_number}" already exists`);

    const vehicle = await this.prisma.transportVehicle.create({
      data: { institute_id: instituteId, registration_number: dto.registration_number, capacity: dto.capacity ?? 40, model: dto.model, is_active: dto.is_active ?? true },
    });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.VEHICLE, entityId: String(vehicle.vehicle_id), action: 'create' });
    return vehicle;
  }

  async findAll(instituteId: string, search?: string) {
    return this.prisma.transportVehicle.findMany({
      where: {
        institute_id: instituteId,
        registration_number: search ? { contains: search, mode: 'insensitive' } : undefined,
      },
      orderBy: { registration_number: 'asc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const vehicle = await this.prisma.transportVehicle.findFirst({ where: { vehicle_id: id, institute_id: instituteId } });
    if (!vehicle) throw new NotFoundException(`Vehicle #${id} not found`);
    return vehicle;
  }

  async update(instituteId: string, id: number, dto: UpdateVehicleDto, actorId?: string) {
    const existing = await this.findOne(instituteId, id);

    if (dto.registration_number && dto.registration_number !== existing.registration_number) {
      const clash = await this.prisma.transportVehicle.findUnique({
        where: { institute_id_registration_number: { institute_id: instituteId, registration_number: dto.registration_number } },
      });
      if (clash) throw new ConflictException(`Vehicle "${dto.registration_number}" already exists`);
    }

    const updated = await this.prisma.transportVehicle.update({
      where: { vehicle_id: id },
      data: dto,
    });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.VEHICLE, entityId: String(id), action: 'update' });
    return updated;
  }

  async remove(instituteId: string, id: number, actorId?: string) {
    await this.findOne(instituteId, id);
    try {
      await this.prisma.transportVehicle.delete({ where: { vehicle_id: id } });
    } catch (err: any) {
      if (err?.code === 'P2003') {
        throw new ConflictException(`Vehicle #${id} has route assignments, GPS/location history, or maintenance records and cannot be deleted — set is_active=false instead`);
      }
      throw err;
    }
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.VEHICLE, entityId: String(id), action: 'delete' });
    return { deleted: true };
  }
}
