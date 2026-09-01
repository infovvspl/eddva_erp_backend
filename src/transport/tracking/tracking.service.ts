import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TransportAuditService } from '../common/transport-audit.service';
import { TRANSPORT_ENTITY } from '../common/transport-entities';
import { RegisterGpsDeviceDto } from './dto/register-gps-device.dto';
import { IngestLocationDto } from './dto/ingest-location.dto';
import { TriggerAlertDto } from './dto/trigger-alert.dto';
import { CreateVehicleMaintenanceDto } from './dto/create-maintenance.dto';

@Injectable()
export class TrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: TransportAuditService,
  ) {}

  private async assertVehicleExists(instituteId: string, vehicleId: number) {
    const vehicle = await this.prisma.transportVehicle.findFirst({ where: { vehicle_id: vehicleId, institute_id: instituteId } });
    if (!vehicle) throw new NotFoundException(`Vehicle #${vehicleId} not found`);
    return vehicle;
  }

  // ─── GPS Devices ──────────────────────────────────────────────────────

  async registerDevice(instituteId: string, vehicleId: number, dto: RegisterGpsDeviceDto, actorId?: string) {
    await this.assertVehicleExists(instituteId, vehicleId);
    const device = await this.prisma.transportGpsDevice.create({
      data: { vehicle_id: vehicleId, device_serial: dto.device_serial, sim_number: dto.sim_number, installed_date: dto.installed_date ? new Date(dto.installed_date) : undefined },
    });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.GPS_DEVICE, entityId: String(device.device_id), action: 'create', metadata: { vehicle_id: vehicleId } });
    return device;
  }

  async getDevices(instituteId: string, vehicleId: number) {
    await this.assertVehicleExists(instituteId, vehicleId);
    return this.prisma.transportGpsDevice.findMany({ where: { vehicle_id: vehicleId } });
  }

  // ─── Location Ingestion (public — no institute scoping available) ──────

  /**
   * Deliberately unauthenticated, matching the source project's design
   * (see TrackingController comment: "Could be unguarded or use
   * device-specific token in prod"). No auth/RBAC change here — this is a
   * pre-existing design decision being preserved, not a new gap introduced
   * by this port.
   */
  /** log_id is a Postgres bigint (Prisma returns a native JS BigInt for it, which neither JSON.stringify nor the response interceptor can serialize) — always surface it as a string. */
  private serializeLog<T extends { log_id: bigint }>(log: T) {
    return { ...log, log_id: log.log_id.toString() };
  }

  async ingestLocationPing(vehicleId: number, dto: IngestLocationDto) {
    const vehicle = await this.prisma.transportVehicle.findUnique({ where: { vehicle_id: vehicleId } });
    if (!vehicle) throw new NotFoundException(`Vehicle #${vehicleId} not found`);

    const log = await this.prisma.transportLocationLog.create({
      data: {
        vehicle_id: vehicleId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        speed_kmph: dto.speed_kmph,
        heading: dto.heading,
        recorded_at: new Date(),
      },
    });
    return this.serializeLog(log);
  }

  async getLatestLocation(instituteId: string, vehicleId: number) {
    await this.assertVehicleExists(instituteId, vehicleId);
    const log = await this.prisma.transportLocationLog.findFirst({ where: { vehicle_id: vehicleId }, orderBy: { recorded_at: 'desc' } });
    return log ? this.serializeLog(log) : null;
  }

  async getLocationHistory(instituteId: string, vehicleId: number, fromDate: Date, toDate: Date) {
    await this.assertVehicleExists(instituteId, vehicleId);
    const logs = await this.prisma.transportLocationLog.findMany({
      where: { vehicle_id: vehicleId, recorded_at: { gte: fromDate, lte: toDate } },
      orderBy: { recorded_at: 'asc' },
    });
    return logs.map((log) => this.serializeLog(log));
  }

  // ─── Geofence Alerts ──────────────────────────────────────────────────

  async triggerAlert(instituteId: string, vehicleId: number, dto: TriggerAlertDto, actorId?: string) {
    await this.assertVehicleExists(instituteId, vehicleId);
    const alert = await this.prisma.transportGeofenceAlert.create({
      data: { vehicle_id: vehicleId, alert_type: dto.alert_type as any, triggered_at: new Date() },
    });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.GEOFENCE_ALERT, entityId: String(alert.alert_id), action: 'create', metadata: { vehicle_id: vehicleId, alert_type: dto.alert_type } });
    return alert;
  }

  async resolveAlert(instituteId: string, alertId: number, actorId?: string) {
    const alert = await this.prisma.transportGeofenceAlert.findUnique({ where: { alert_id: alertId }, include: { vehicle: true } });
    if (!alert || alert.vehicle.institute_id !== instituteId) throw new NotFoundException(`Alert #${alertId} not found`);

    const updated = await this.prisma.transportGeofenceAlert.update({ where: { alert_id: alertId }, data: { resolved: true } });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.GEOFENCE_ALERT, entityId: String(alertId), action: 'resolve' });
    return updated;
  }

  async getActiveAlerts(instituteId: string, vehicleId?: number) {
    return this.prisma.transportGeofenceAlert.findMany({
      where: {
        resolved: false,
        vehicle_id: vehicleId,
        vehicle: { institute_id: instituteId },
      },
      include: { vehicle: { select: { vehicle_id: true, registration_number: true } } },
      orderBy: { triggered_at: 'desc' },
    });
  }

  // ─── Maintenance ──────────────────────────────────────────────────────

  async addMaintenanceRecord(instituteId: string, vehicleId: number, dto: CreateVehicleMaintenanceDto, actorId?: string) {
    await this.assertVehicleExists(instituteId, vehicleId);
    const record = await this.prisma.transportVehicleMaintenance.create({
      data: {
        vehicle_id: vehicleId,
        service_date: new Date(dto.service_date),
        service_type: dto.service_type,
        cost: dto.cost,
        next_service_due_km: dto.next_service_due_km,
        next_service_due_date: dto.next_service_due_date ? new Date(dto.next_service_due_date) : undefined,
      },
    });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.VEHICLE_MAINTENANCE, entityId: String(record.maintenance_id), action: 'create', metadata: { vehicle_id: vehicleId } });
    return record;
  }

  async getMaintenanceHistory(instituteId: string, vehicleId: number) {
    await this.assertVehicleExists(instituteId, vehicleId);
    return this.prisma.transportVehicleMaintenance.findMany({ where: { vehicle_id: vehicleId }, orderBy: { service_date: 'desc' } });
  }
}
