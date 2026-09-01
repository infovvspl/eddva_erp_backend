import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TransportAuditService } from '../common/transport-audit.service';
import { TRANSPORT_ENTITY } from '../common/transport-entities';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { CreateRouteStopDto } from './dto/create-route-stop.dto';
import { AssignVehicleToRouteDto } from './dto/assign-vehicle.dto';

@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: TransportAuditService,
  ) {}

  async create(instituteId: string, dto: CreateRouteDto, actorId?: string) {
    const route = await this.prisma.transportRoute.create({ data: { ...dto, institute_id: instituteId } });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.ROUTE, entityId: String(route.route_id), action: 'create' });
    return route;
  }

  async findAll(instituteId: string, search?: string) {
    return this.prisma.transportRoute.findMany({
      where: { institute_id: instituteId, name: search ? { contains: search, mode: 'insensitive' } : undefined },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const route = await this.prisma.transportRoute.findFirst({
      where: { route_id: id, institute_id: instituteId },
      include: { stops: { orderBy: { sequence_no: 'asc' } } },
    });
    if (!route) throw new NotFoundException(`Route #${id} not found`);
    return route;
  }

  private async assertExists(instituteId: string, id: number) {
    const route = await this.prisma.transportRoute.findFirst({ where: { route_id: id, institute_id: instituteId } });
    if (!route) throw new NotFoundException(`Route #${id} not found`);
    return route;
  }

  async update(instituteId: string, id: number, dto: UpdateRouteDto, actorId?: string) {
    await this.assertExists(instituteId, id);
    const updated = await this.prisma.transportRoute.update({ where: { route_id: id }, data: dto });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.ROUTE, entityId: String(id), action: 'update' });
    return updated;
  }

  async remove(instituteId: string, id: number, actorId?: string) {
    await this.assertExists(instituteId, id);
    await this.prisma.transportRoute.delete({ where: { route_id: id } });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.ROUTE, entityId: String(id), action: 'delete' });
    return { deleted: true };
  }

  // ─── Stops ────────────────────────────────────────────────────────────

  async addStop(instituteId: string, routeId: number, dto: CreateRouteStopDto, actorId?: string) {
    await this.assertExists(instituteId, routeId);
    const stop = await this.prisma.transportRouteStop.create({ data: { ...dto, route_id: routeId } });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.ROUTE_STOP, entityId: String(stop.stop_id), action: 'create', metadata: { route_id: routeId } });
    return stop;
  }

  async getStops(instituteId: string, routeId: number) {
    await this.assertExists(instituteId, routeId);
    return this.prisma.transportRouteStop.findMany({ where: { route_id: routeId }, orderBy: { sequence_no: 'asc' } });
  }

  // ─── Vehicle Assignments ──────────────────────────────────────────────

  async assignVehicle(instituteId: string, routeId: number, vehicleId: number, dto: AssignVehicleToRouteDto, actorId?: string) {
    await this.assertExists(instituteId, routeId);

    const vehicle = await this.prisma.transportVehicle.findFirst({ where: { vehicle_id: vehicleId, institute_id: instituteId } });
    if (!vehicle) throw new NotFoundException(`Vehicle #${vehicleId} not found`);

    if (dto.driver_id) {
      const driver = await this.prisma.transportDriver.findFirst({ where: { driver_id: dto.driver_id, institute_id: instituteId } });
      if (!driver) throw new NotFoundException(`Driver #${dto.driver_id} not found`);
    }

    const assignment = await this.prisma.transportRouteVehicleAssignment.create({
      data: {
        route_id: routeId,
        vehicle_id: vehicleId,
        driver_id: dto.driver_id,
        effective_from: new Date(dto.effective_from),
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: TRANSPORT_ENTITY.ROUTE_VEHICLE_ASSIGNMENT,
      entityId: String(assignment.assignment_id),
      action: 'create',
      metadata: { route_id: routeId, vehicle_id: vehicleId, driver_id: dto.driver_id },
    });
    return assignment;
  }

  async getVehicleAssignments(instituteId: string, routeId: number) {
    await this.assertExists(instituteId, routeId);
    return this.prisma.transportRouteVehicleAssignment.findMany({
      where: { route_id: routeId },
      include: { vehicle: true, driver: true },
      orderBy: { effective_from: 'desc' },
    });
  }
}
