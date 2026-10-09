import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';

const RECENT_ALERTS_SIZE = 5;
const LICENSE_EXPIRY_WINDOW_DAYS = 30;

function startOfMonth(): Date {
  const date = new Date();

  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);

  return date;
}

export interface TransportDashboardSummary {
  range: {
    from: string | null;
    to: string | null;
  };

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

  drivers: {
    active: number;
    on_leave: number;
    inactive: number;
    by_status: Array<{
      status: string;
      count: number;
    }>;
  };

  passengers: {
    active: number;
    by_type: Array<{
      type: string;
      count: number;
    }>;
  };

  fees: {
    active_subscriptions: number;
    expired_subscriptions: number;
    collection_in_range: number;
    payments_in_range: number;
  };

  alerts: {
    unresolved: number;
    by_type: Array<{
      type: string;
      count: number;
    }>;
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

  private dateRange(from?: string, to?: string) {
    if (!from && !to) {
      return undefined;
    }

    return {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  async getSummary(
    instituteId: string,
    from?: string,
    to?: string,
  ): Promise<TransportDashboardSummary> {
    const instId = requireInstituteId(instituteId);

    const now = new Date();

    const licenseWindowEnd = new Date(
      now.getTime() +
        LICENSE_EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    /*
     * When no date range is supplied, fee collection defaults
     * to the current month.
     */
    const paymentDateRange =
      this.dateRange(from, to) ?? {
        gte: startOfMonth(),
      };

    const [
      totalVehicles,
      activeVehicles,
      totalRoutes,

      totalDrivers,
      activeDrivers,
      licensesExpiringSoon,
      driversByStatus,

      totalPassengers,
      activePassengers,
      passengersByType,

      subscriptionsByStatus,

      feeCollection,

      alertsByType,
      unresolvedAlerts,

      maintenanceDue,

      recentAlerts,
    ] = await Promise.all([
      /*
       * ---------------------------------------------------------
       * VEHICLES
       * ---------------------------------------------------------
       */

      this.prisma.transportVehicle.count({
        where: {
          institute_id: instId,
        },
      }),

      this.prisma.transportVehicle.count({
        where: {
          institute_id: instId,
          is_active: true,
        },
      }),

      /*
       * ---------------------------------------------------------
       * ROUTES
       * ---------------------------------------------------------
       */

      this.prisma.transportRoute.count({
        where: {
          institute_id: instId,
        },
      }),

      /*
       * ---------------------------------------------------------
       * DRIVERS
       * ---------------------------------------------------------
       */

      this.prisma.transportDriver.count({
        where: {
          institute_id: instId,
        },
      }),

      this.prisma.transportDriver.count({
        where: {
          institute_id: instId,
          status: 'active',
        },
      }),

      /*
       * Only active drivers whose license expires
       * between now and the next 30 days.
       */
      this.prisma.transportDriver.count({
        where: {
          institute_id: instId,
          status: 'active',
          license_expiry: {
            gte: now,
            lte: licenseWindowEnd,
          },
        },
      }),

      this.prisma.transportDriver.groupBy({
        by: ['status'],
        where: {
          institute_id: instId,
        },
        _count: {
          _all: true,
        },
      }),

      /*
       * ---------------------------------------------------------
       * PASSENGERS
       * ---------------------------------------------------------
       */

      this.prisma.transportPassenger.count({
        where: {
          institute_id: instId,
        },
      }),

      this.prisma.transportPassenger.count({
        where: {
          institute_id: instId,
          status: 'active',
        },
      }),

      this.prisma.transportPassenger.groupBy({
        by: ['type'],
        where: {
          institute_id: instId,
        },
        _count: {
          _all: true,
        },
      }),

      /*
       * ---------------------------------------------------------
       * FEE SUBSCRIPTIONS
       * ---------------------------------------------------------
       */

      this.prisma.transportPassengerFeeSubscription.groupBy({
        by: ['status'],
        where: {
          passenger: {
            institute_id: instId,
          },
        },
        _count: {
          _all: true,
        },
      }),

      /*
       * ---------------------------------------------------------
       * FEE COLLECTION
       * ---------------------------------------------------------
       *
       * TransportFeePayment does not have institute_id directly,
       * so institute scope is applied through:
       *
       * payment -> subscription -> passenger -> institute
       */

      this.prisma.transportFeePayment.aggregate({
        where: {
          status: 'success',

          payment_date: paymentDateRange,

          subscription: {
            passenger: {
              institute_id: instId,
            },
          },
        },

        _sum: {
          amount_paid: true,
        },

        _count: {
          _all: true,
        },
      }),

      /*
       * ---------------------------------------------------------
       * GEOFENCE ALERTS
       * ---------------------------------------------------------
       */

      this.prisma.transportGeofenceAlert.groupBy({
        by: ['alert_type'],

        where: {
          resolved: false,

          vehicle: {
            institute_id: instId,
          },
        },

        _count: {
          _all: true,
        },
      }),

      this.prisma.transportGeofenceAlert.count({
        where: {
          resolved: false,

          vehicle: {
            institute_id: instId,
          },
        },
      }),

      /*
       * ---------------------------------------------------------
       * VEHICLE MAINTENANCE
       * ---------------------------------------------------------
       */

      this.prisma.transportVehicleMaintenance.count({
        where: {
          vehicle: {
            institute_id: instId,
          },

          next_service_due_date: {
            lte: now,
          },
        },
      }),

      /*
       * ---------------------------------------------------------
       * RECENT ALERTS
       * ---------------------------------------------------------
       */

      this.prisma.transportGeofenceAlert.findMany({
        where: {
          resolved: false,

          vehicle: {
            institute_id: instId,
          },
        },

        orderBy: {
          triggered_at: 'desc',
        },

        take: RECENT_ALERTS_SIZE,

        select: {
          alert_id: true,
          vehicle_id: true,
          alert_type: true,
          triggered_at: true,

          vehicle: {
            select: {
              registration_number: true,
            },
          },
        },
      }),
    ]);

    /*
     * ---------------------------------------------------------
     * STATUS MAPS
     * ---------------------------------------------------------
     */

    const driverStatusMap = Object.fromEntries(
      driversByStatus.map((row) => [
        row.status,
        row._count._all,
      ]),
    );

    const subscriptionStatusMap = Object.fromEntries(
      subscriptionsByStatus.map((row) => [
        row.status,
        row._count._all,
      ]),
    );

    /*
     * ---------------------------------------------------------
     * RESPONSE
     * ---------------------------------------------------------
     */

    return {
      range: {
        from: from ?? null,
        to: to ?? null,
      },

      /*
       * -------------------------------------------------------
       * TOTALS
       * -------------------------------------------------------
       */

      totals: {
        vehicles: totalVehicles,

        active_vehicles: activeVehicles,

        routes: totalRoutes,

        drivers: totalDrivers,

        active_drivers: activeDrivers,

        licenses_expiring_soon: licensesExpiringSoon,

        passengers: totalPassengers,

        active_passengers: activePassengers,

        open_alerts: unresolvedAlerts,

        maintenance_due: maintenanceDue,
      },

      /*
       * -------------------------------------------------------
       * DRIVERS
       * -------------------------------------------------------
       */

      drivers: {
        active: driverStatusMap.active ?? 0,

        on_leave: driverStatusMap.on_leave ?? 0,

        inactive: driverStatusMap.inactive ?? 0,

        by_status: driversByStatus.map((row) => ({
          status: row.status,
          count: row._count._all,
        })),
      },

      /*
       * -------------------------------------------------------
       * PASSENGERS
       * -------------------------------------------------------
       */

      passengers: {
        active: activePassengers,

        by_type: passengersByType.map((row) => ({
          type: row.type,
          count: row._count._all,
        })),
      },

      /*
       * -------------------------------------------------------
       * FEES
       * -------------------------------------------------------
       */

      fees: {
        active_subscriptions:
          subscriptionStatusMap.active ?? 0,

        expired_subscriptions:
          subscriptionStatusMap.expired ?? 0,

        collection_in_range: Number(
          feeCollection._sum.amount_paid ?? 0,
        ),

        payments_in_range:
          feeCollection._count._all,
      },

      /*
       * -------------------------------------------------------
       * ALERTS
       * -------------------------------------------------------
       */

      alerts: {
        unresolved: unresolvedAlerts,

        by_type: alertsByType.map((row) => ({
          type: row.alert_type,
          count: row._count._all,
        })),
      },

      /*
       * -------------------------------------------------------
       * RECENT ALERTS
       * -------------------------------------------------------
       */

      recent_alerts: recentAlerts.map((alert) => ({
        alert_id: alert.alert_id,

        vehicle_id: alert.vehicle_id,

        registration_number:
          alert.vehicle.registration_number,

        alert_type: alert.alert_type,

        triggered_at: alert.triggered_at,
      })),
    };
  }
}