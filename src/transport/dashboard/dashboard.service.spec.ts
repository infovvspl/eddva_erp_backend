import { ForbiddenException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

function makePrisma() {
  return {
    transportVehicle: { count: jest.fn().mockResolvedValue(0) },
    transportRoute: { count: jest.fn().mockResolvedValue(0) },
    transportDriver: { count: jest.fn().mockResolvedValue(0) },
    transportPassenger: { count: jest.fn().mockResolvedValue(0) },
    transportGeofenceAlert: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    transportVehicleMaintenance: { count: jest.fn().mockResolvedValue(0) },
    transportFeePayment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount_paid: null } }) },
    transportPassengerFeeSubscription: { count: jest.fn().mockResolvedValue(0) },
  };
}

describe('Transport DashboardService', () => {
  it("scopes every query to the caller's institute", async () => {
    const prisma = makePrisma();
    await new DashboardService(prisma as any).getSummary('inst-a');

    for (const call of prisma.transportVehicle.count.mock.calls) {
      expect(call[0].where.institute_id).toBe('inst-a');
    }
    for (const call of prisma.transportRoute.count.mock.calls) {
      expect(call[0].where.institute_id).toBe('inst-a');
    }
    for (const call of prisma.transportDriver.count.mock.calls) {
      expect(call[0].where.institute_id).toBe('inst-a');
    }
    for (const call of prisma.transportPassenger.count.mock.calls) {
      expect(call[0].where.institute_id).toBe('inst-a');
    }
    expect(prisma.transportGeofenceAlert.count.mock.calls[0][0].where.vehicle.institute_id).toBe('inst-a');
    expect(prisma.transportVehicleMaintenance.count.mock.calls[0][0].where.vehicle.institute_id).toBe('inst-a');
    expect(prisma.transportFeePayment.aggregate.mock.calls[0][0].where.subscription.passenger.institute_id).toBe('inst-a');
    expect(prisma.transportPassengerFeeSubscription.count.mock.calls[0][0].where.passenger.institute_id).toBe('inst-a');
    expect(prisma.transportGeofenceAlert.findMany.mock.calls[0][0].where.vehicle.institute_id).toBe('inst-a');
  });

  it('sums this month\'s successful fee payments and shapes recent alerts', async () => {
    const prisma = makePrisma();
    prisma.transportFeePayment.aggregate.mockResolvedValue({ _sum: { amount_paid: 4500 } });
    prisma.transportGeofenceAlert.findMany.mockResolvedValue([
      {
        alert_id: 1,
        vehicle_id: 2,
        alert_type: 'sos',
        triggered_at: new Date('2026-09-27'),
        vehicle: { registration_number: 'KA-01-AB-1234' },
      },
    ]);

    const summary = await new DashboardService(prisma as any).getSummary('inst-a');

    expect(summary.fees.collected_this_month).toBe(4500);
    expect(summary.recent_alerts[0]).toMatchObject({
      alert_id: 1,
      vehicle_id: 2,
      registration_number: 'KA-01-AB-1234',
      alert_type: 'sos',
    });
  });

  it('refuses a session with no institute', async () => {
    const prisma = makePrisma();
    await expect(new DashboardService(prisma as any).getSummary('')).rejects.toThrow(ForbiddenException);
    expect(prisma.transportVehicle.count).not.toHaveBeenCalled();
  });
});
