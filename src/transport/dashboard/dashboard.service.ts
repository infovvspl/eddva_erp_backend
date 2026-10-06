import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function startOfMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Transport models are institute-scoped (institute_id required), like every
 * other Transport service method. TransportFeePayment and
 * TransportGeofenceAlert have no direct institute_id column, so those are
 * filtered via a nested relation instead of a flat where clause.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private dateRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    return {
      ...(from && { gte: new Date(from) }),
      ...(to && { lte: new Date(to) }),
    };
  }

  async getSummary(instituteId: string, from?: string, to?: string) {
    const paymentDateRange = this.dateRange(from, to) ?? { gte: startOfMonth() };

    const [
      totalVehicles,
      activeVehicles,
      totalRoutes,
      driversByStatus,
      passengersByType,
      activePassengers,
      subscriptionsByStatus,
      feeCollection,
      alertsByType,
      unresolvedAlerts,
    ] = await Promise.all([
      this.prisma.transportVehicle.count({ where: { institute_id: instituteId } }),
      this.prisma.transportVehicle.count({ where: { institute_id: instituteId, is_active: true } }),
      this.prisma.transportRoute.count({ where: { institute_id: instituteId } }),
      this.prisma.transportDriver.groupBy({
        by: ['status'],
        where: { institute_id: instituteId },
        _count: { _all: true },
      }),
      this.prisma.transportPassenger.groupBy({
        by: ['type'],
        where: { institute_id: instituteId },
        _count: { _all: true },
      }),
      this.prisma.transportPassenger.count({ where: { institute_id: instituteId, status: 'active' } }),
      this.prisma.transportPassengerFeeSubscription.groupBy({
        by: ['status'],
        where: { passenger: { institute_id: instituteId } },
        _count: { _all: true },
      }),
      this.prisma.transportFeePayment.aggregate({
        _sum: { amount_paid: true },
        _count: { _all: true },
        where: {
          status: 'success',
          payment_date: paymentDateRange,
          subscription: { passenger: { institute_id: instituteId } },
        },
      }),
      this.prisma.transportGeofenceAlert.groupBy({
        by: ['alert_type'],
        where: { resolved: false, vehicle: { institute_id: instituteId } },
        _count: { _all: true },
      }),
      this.prisma.transportGeofenceAlert.count({
        where: { resolved: false, vehicle: { institute_id: instituteId } },
      }),
    ]);

    const driverStatusMap = Object.fromEntries(driversByStatus.map((r) => [r.status, r._count._all]));
    const subscriptionStatusMap = Object.fromEntries(subscriptionsByStatus.map((r) => [r.status, r._count._all]));

    return {
      range: { from: from ?? null, to: to ?? null },
      fleet: {
        total_vehicles: totalVehicles,
        active_vehicles: activeVehicles,
        total_routes: totalRoutes,
      },
      drivers: {
        active: driverStatusMap.active ?? 0,
        on_leave: driverStatusMap.on_leave ?? 0,
        inactive: driverStatusMap.inactive ?? 0,
        by_status: driversByStatus.map((r) => ({ status: r.status, count: r._count._all })),
      },
      passengers: {
        active: activePassengers,
        by_type: passengersByType.map((r) => ({ type: r.type, count: r._count._all })),
      },
      fees: {
        active_subscriptions: subscriptionStatusMap.active ?? 0,
        expired_subscriptions: subscriptionStatusMap.expired ?? 0,
        collection_in_range: Number(feeCollection._sum.amount_paid ?? 0),
        payments_in_range: feeCollection._count._all,
      },
      alerts: {
        unresolved: unresolvedAlerts,
        by_type: alertsByType.map((r) => ({ type: r.alert_type, count: r._count._all })),
      },
    };
  }
}
