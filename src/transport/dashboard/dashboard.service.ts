import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';

const RECENT_ALERTS_SIZE = 5;

export interface TransportDashboardSummary {
  totals: {
    vehicles: number;
    active_vehicles: number;
    routes: number;
    drivers: number;
    active_drivers: number;
    licenses_expiring_soon: number;
    passengers: number;
    active_passengers: number;
    open_alerts: number;
    maintenance_due: number;
  };
  fees: {
    collected_this_month: number;
    active_subscriptions: number;
  };
  recent_alerts: Array<{
    alert_id: number;
    vehicle_id: number;
    registration_number: string;
    alert_type: string;
    triggered_at: Date;
  }>;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every figure is limited to the caller's institute. */
  async getSummary(instituteId: string): Promise<TransportDashboardSummary> {
    const instId = requireInstituteId(instituteId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const licenseWindowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [
      vehicles,
      activeVehicles,
      routes,
      drivers,
      activeDrivers,
      licensesExpiringSoon,
      passengers,
      activePassengers,
      openAlerts,
      maintenanceDue,
      feesCollected,
      activeSubscriptions,
      recentAlerts,
    ] = await Promise.all([
      this.prisma.transportVehicle.count({ where: { institute_id: instId } }),
      this.prisma.transportVehicle.count({ where: { institute_id: instId, is_active: true } }),
      this.prisma.transportRoute.count({ where: { institute_id: instId } }),
      this.prisma.transportDriver.count({ where: { institute_id: instId } }),
      this.prisma.transportDriver.count({ where: { institute_id: instId, status: 'active' } }),
      this.prisma.transportDriver.count({
        where: { institute_id: instId, status: 'active', license_expiry: { lte: licenseWindowEnd } },
      }),
      this.prisma.transportPassenger.count({ where: { institute_id: instId } }),
      this.prisma.transportPassenger.count({ where: { institute_id: instId, status: 'active' } }),
      this.prisma.transportGeofenceAlert.count({
        where: { resolved: false, vehicle: { institute_id: instId } },
      }),
      this.prisma.transportVehicleMaintenance.count({
        where: {
          vehicle: { institute_id: instId },
          next_service_due_date: { lte: now },
        },
      }),
      this.prisma.transportFeePayment.aggregate({
        where: {
          status: 'success',
          payment_date: { gte: monthStart },
          subscription: { passenger: { institute_id: instId } },
        },
        _sum: { amount_paid: true },
      }),
      this.prisma.transportPassengerFeeSubscription.count({
        where: { status: 'active', passenger: { institute_id: instId } },
      }),
      this.prisma.transportGeofenceAlert.findMany({
        where: { resolved: false, vehicle: { institute_id: instId } },
        orderBy: { triggered_at: 'desc' },
        take: RECENT_ALERTS_SIZE,
        select: {
          alert_id: true,
          vehicle_id: true,
          alert_type: true,
          triggered_at: true,
          vehicle: { select: { registration_number: true } },
        },
      }),
    ]);

    return {
      totals: {
        vehicles,
        active_vehicles: activeVehicles,
        routes,
        drivers,
        active_drivers: activeDrivers,
        licenses_expiring_soon: licensesExpiringSoon,
        passengers,
        active_passengers: activePassengers,
        open_alerts: openAlerts,
        maintenance_due: maintenanceDue,
      },
      fees: {
        collected_this_month: Number(feesCollected._sum.amount_paid ?? 0),
        active_subscriptions: activeSubscriptions,
      },
      recent_alerts: recentAlerts.map((a) => ({
        alert_id: a.alert_id,
        vehicle_id: a.vehicle_id,
        registration_number: a.vehicle.registration_number,
        alert_type: a.alert_type,
        triggered_at: a.triggered_at,
      })),
    };
  }
}
