import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TransportAuditService } from '../common/transport-audit.service';
import { TRANSPORT_ENTITY } from '../common/transport-entities';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { CreateDriverDocumentDto } from './dto/create-driver-document.dto';
import { AssignVehicleToDriverDto } from './dto/assign-vehicle-to-driver.dto';

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: TransportAuditService,
  ) {}

  async create(instituteId: string, dto: CreateDriverDto, actorId?: string) {
    const driver = await this.prisma.transportDriver.create({
      data: {
        institute_id: instituteId,
        name: dto.name,
        phone: dto.phone,
        license_number: dto.license_number,
        license_expiry: new Date(dto.license_expiry),
        address: dto.address,
        photo_url: dto.photo_url,
        joining_date: dto.joining_date ? new Date(dto.joining_date) : undefined,
      },
    });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.DRIVER, entityId: String(driver.driver_id), action: 'create' });
    return driver;
  }

  async findAll(instituteId: string, search?: string) {
    return this.prisma.transportDriver.findMany({
      where: {
        institute_id: instituteId,
        OR: search ? [{ name: { contains: search, mode: 'insensitive' } }, { license_number: { contains: search, mode: 'insensitive' } }] : undefined,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const driver = await this.prisma.transportDriver.findFirst({ where: { driver_id: id, institute_id: instituteId } });
    if (!driver) throw new NotFoundException(`Driver #${id} not found`);
    return driver;
  }

  async update(instituteId: string, id: number, dto: UpdateDriverDto, actorId?: string) {
    await this.findOne(instituteId, id);
    const updated = await this.prisma.transportDriver.update({
      where: { driver_id: id },
      data: {
        name: dto.name,
        phone: dto.phone,
        license_number: dto.license_number,
        license_expiry: dto.license_expiry ? new Date(dto.license_expiry) : undefined,
        address: dto.address,
        photo_url: dto.photo_url,
        joining_date: dto.joining_date ? new Date(dto.joining_date) : undefined,
        status: dto.status as any,
      },
    });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.DRIVER, entityId: String(id), action: 'update' });
    return updated;
  }

  // ─── Documents ────────────────────────────────────────────────────────

  async addDocument(instituteId: string, driverId: number, dto: CreateDriverDocumentDto, actorId?: string) {
    await this.findOne(instituteId, driverId);
    const doc = await this.prisma.transportDriverDocument.create({
      data: { driver_id: driverId, doc_type: dto.doc_type, doc_url: dto.doc_url, expiry_date: dto.expiry_date ? new Date(dto.expiry_date) : undefined },
    });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.DRIVER_DOCUMENT, entityId: String(doc.document_id), action: 'create', metadata: { driver_id: driverId } });
    return doc;
  }

  async getDocuments(instituteId: string, driverId: number) {
    await this.findOne(instituteId, driverId);
    return this.prisma.transportDriverDocument.findMany({ where: { driver_id: driverId }, orderBy: { created_at: 'desc' } });
  }

  // ─── Vehicle History ──────────────────────────────────────────────────

  async assignVehicle(instituteId: string, driverId: number, vehicleId: number, dto: AssignVehicleToDriverDto, actorId?: string) {
    await this.findOne(instituteId, driverId);
    const vehicle = await this.prisma.transportVehicle.findFirst({ where: { vehicle_id: vehicleId, institute_id: instituteId } });
    if (!vehicle) throw new NotFoundException(`Vehicle #${vehicleId} not found`);

    const history = await this.prisma.transportDriverVehicleHistory.create({
      data: { driver_id: driverId, vehicle_id: vehicleId, assigned_from: new Date(dto.assigned_from) },
    });
    await this.audit.log({
      userId: actorId,
      entityType: TRANSPORT_ENTITY.DRIVER_VEHICLE_HISTORY,
      entityId: String(history.history_id),
      action: 'create',
      metadata: { driver_id: driverId, vehicle_id: vehicleId },
    });
    return history;
  }

  async getVehicleHistory(instituteId: string, driverId: number) {
    await this.findOne(instituteId, driverId);
    return this.prisma.transportDriverVehicleHistory.findMany({
      where: { driver_id: driverId },
      include: { vehicle: true },
      orderBy: { assigned_from: 'desc' },
    });
  }
}
