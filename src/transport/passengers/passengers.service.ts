import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TransportAuditService } from '../common/transport-audit.service';
import { TRANSPORT_ENTITY } from '../common/transport-entities';
import { CreatePassengerDto } from './dto/create-passenger.dto';
import { UpdatePassengerDto } from './dto/update-passenger.dto';
import { AllocatePassengerRouteDto } from './dto/allocate-route.dto';

@Injectable()
export class PassengersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: TransportAuditService,
  ) {}

  async create(instituteId: string, dto: CreatePassengerDto, actorId?: string) {
    const passenger = await this.prisma.transportPassenger.create({ data: { ...dto, institute_id: instituteId } });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.PASSENGER, entityId: String(passenger.passenger_id), action: 'create' });
    return passenger;
  }

  async findAll(instituteId: string, search?: string, type?: string) {
    return this.prisma.transportPassenger.findMany({
      where: {
        institute_id: instituteId,
        type: type as any,
        name: search ? { contains: search, mode: 'insensitive' } : undefined,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const passenger = await this.prisma.transportPassenger.findFirst({ where: { passenger_id: id, institute_id: instituteId } });
    if (!passenger) throw new NotFoundException(`Passenger #${id} not found`);
    return passenger;
  }

  async update(instituteId: string, id: number, dto: UpdatePassengerDto, actorId?: string) {
    await this.findOne(instituteId, id);
    const updated = await this.prisma.transportPassenger.update({ where: { passenger_id: id }, data: dto as any });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.PASSENGER, entityId: String(id), action: 'update' });
    return updated;
  }

  // ─── Route Allocations ────────────────────────────────────────────────

  async allocateRoute(instituteId: string, passengerId: number, routeId: number, dto: AllocatePassengerRouteDto, actorId?: string) {
    await this.findOne(instituteId, passengerId);

    const route = await this.prisma.transportRoute.findFirst({ where: { route_id: routeId, institute_id: instituteId } });
    if (!route) throw new NotFoundException(`Route #${routeId} not found`);

    if (dto.pickup_stop_id) {
      const stop = await this.prisma.transportRouteStop.findFirst({ where: { stop_id: dto.pickup_stop_id, route_id: routeId } });
      if (!stop) throw new NotFoundException(`Pickup stop #${dto.pickup_stop_id} not found on route #${routeId}`);
    }
    if (dto.drop_stop_id) {
      const stop = await this.prisma.transportRouteStop.findFirst({ where: { stop_id: dto.drop_stop_id, route_id: routeId } });
      if (!stop) throw new NotFoundException(`Drop stop #${dto.drop_stop_id} not found on route #${routeId}`);
    }

    const allocation = await this.prisma.transportPassengerRouteAllocation.create({
      data: {
        passenger_id: passengerId,
        route_id: routeId,
        pickup_stop_id: dto.pickup_stop_id,
        drop_stop_id: dto.drop_stop_id,
        effective_from: new Date(dto.effective_from),
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: TRANSPORT_ENTITY.PASSENGER_ALLOCATION,
      entityId: String(allocation.allocation_id),
      action: 'create',
      metadata: { passenger_id: passengerId, route_id: routeId },
    });
    return allocation;
  }

  async getAllocations(instituteId: string, passengerId: number) {
    await this.findOne(instituteId, passengerId);
    return this.prisma.transportPassengerRouteAllocation.findMany({
      where: { passenger_id: passengerId },
      include: { route: true, pickup_stop: true, drop_stop: true },
      orderBy: { effective_from: 'desc' },
    });
  }
}
