import { PrismaClient, TransportVehicle, TransportDriver, TransportFeePlan } from '@prisma/client';

/**
 * Seeds ~6 months (2026-05-01 .. 2026-10-14, "today") of realistic Transport
 * transactional data: vehicles, routes+stops, drivers, route/vehicle
 * assignments, passengers + route allocations, fee plans + subscriptions +
 * payments spread across months (paid/pending/failed), vehicle maintenance
 * (some overdue), and geofence alerts (some unresolved) — so the Transport
 * dashboard (vehicles, routes, drivers, licenses expiring, passengers, fee
 * collection, alerts, maintenance due) and the main dashboard's transport
 * summary are populated.
 *
 * Safe to re-run: guarded by an early-return once enough passengers already
 * exist for this institute.
 */

const TODAY = new Date(Date.UTC(2026, 9, 14)); // 2026-10-14
const RANGE_START = new Date(Date.UTC(2026, 4, 1)); // 2026-05-01
const SEED_PASSENGER_THRESHOLD = 60;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export async function seedTransport(prisma: PrismaClient, instId: string): Promise<void> {
  console.log('--- Seeding Transport Transactional Data (last ~6 months) ---');

  const existingPassengers = await prisma.transportPassenger.count({ where: { institute_id: instId } });
  if (existingPassengers >= SEED_PASSENGER_THRESHOLD) {
    console.log(`Transport already has ${existingPassengers} passengers for ${instId} — skipping.`);
    return;
  }

  // ------------------------------------------------------------------
  // Vehicles
  // ------------------------------------------------------------------
  const vehicleDefs = [
    { reg: 'KA-01-AB-1001', model: 'Tata Starbus', capacity: 40 },
    { reg: 'KA-01-AB-1002', model: 'Ashok Leyland Viking', capacity: 45 },
    { reg: 'KA-01-AB-1003', model: 'Force Traveller', capacity: 20 },
    { reg: 'KA-01-AB-1004', model: 'Tata Starbus', capacity: 40 },
    { reg: 'KA-01-AB-1005', model: 'Eicher Skyline Pro', capacity: 35 },
    { reg: 'KA-01-AB-1006', model: 'Mahindra Tourister', capacity: 25 },
  ];
  const vehicles: TransportVehicle[] = [];
  for (const def of vehicleDefs) {
    const vehicle = await prisma.transportVehicle.create({
      data: {
        institute_id: instId,
        registration_number: def.reg,
        capacity: def.capacity,
        model: def.model,
        is_active: true,
      },
    });
    vehicles.push(vehicle);
  }

  // ------------------------------------------------------------------
  // Routes + Stops
  // ------------------------------------------------------------------
  const routeDefs = [
    { name: 'Route 1 — North City', start: 'North Bus Depot', end: 'School Campus', stops: ['Green Park', 'Lake View', 'Market Square'] },
    { name: 'Route 2 — East Hills', start: 'East Hills Terminus', end: 'School Campus', stops: ['Hilltop', 'Riverside', 'Old Town'] },
    { name: 'Route 3 — West End', start: 'West End Circle', end: 'School Campus', stops: ['Sunrise Colony', 'Tech Park', 'Central Mall'] },
    { name: 'Route 4 — South Gate', start: 'South Gate Junction', end: 'School Campus', stops: ['Palm Grove', 'Harbor Road'] },
  ];
  const routes: Array<{ route_id: number; stopIds: number[] }> = [];
  for (const def of routeDefs) {
    const route = await prisma.transportRoute.create({
      data: {
        institute_id: instId,
        name: def.name,
        start_location: def.start,
        end_location: def.end,
      },
    });
    const stopIds: number[] = [];
    for (let i = 0; i < def.stops.length; i++) {
      const stop = await prisma.transportRouteStop.create({
        data: {
          route_id: route.route_id,
          stop_name: def.stops[i],
          sequence_no: i + 1,
          pickup_time: `0${7 + i}:${i === 0 ? '00' : '15'}`,
          drop_time: `1${5 + i}:${i === 0 ? '00' : '30'}`,
        },
      });
      stopIds.push(stop.stop_id);
    }
    routes.push({ route_id: route.route_id, stopIds });
  }

  // ------------------------------------------------------------------
  // Drivers
  // ------------------------------------------------------------------
  const driverDefs = [
    { name: 'Ramesh Kumar', status: 'active' as const, licenseDaysOut: 400 },
    { name: 'Suresh Patil', status: 'active' as const, licenseDaysOut: 20 }, // expiring soon
    { name: 'Manjunath Rao', status: 'active' as const, licenseDaysOut: 10 }, // expiring soon
    { name: 'Vijay Singh', status: 'active' as const, licenseDaysOut: 300 },
    { name: 'Govind Naik', status: 'on_leave' as const, licenseDaysOut: 500 },
    { name: 'Prakash Shetty', status: 'inactive' as const, licenseDaysOut: 60 },
  ];
  const drivers: TransportDriver[] = [];
  for (const def of driverDefs) {
    const driver = await prisma.transportDriver.create({
      data: {
        institute_id: instId,
        name: def.name,
        phone: `98${randomInt(10000000, 99999999)}`,
        license_number: `DL-${instId}-${randomInt(100000, 999999)}`,
        license_expiry: addDays(TODAY, def.licenseDaysOut),
        joining_date: addDays(RANGE_START, -randomInt(60, 800)),
        status: def.status,
      },
    });
    drivers.push(driver);
  }

  // ------------------------------------------------------------------
  // Route <-> Vehicle (+ driver) assignments
  // ------------------------------------------------------------------
  for (let i = 0; i < routes.length; i++) {
    const vehicle = vehicles[i % vehicles.length];
    const driver = drivers[i % drivers.length];
    await prisma.transportRouteVehicleAssignment.create({
      data: {
        route_id: routes[i].route_id,
        vehicle_id: vehicle.vehicle_id,
        driver_id: driver.driver_id,
        effective_from: RANGE_START,
        status: 'active',
      },
    });
  }

  // ------------------------------------------------------------------
  // Fee Plans (one per route)
  // ------------------------------------------------------------------
  const feePlans: TransportFeePlan[] = [];
  for (const route of routes) {
    const plan = await prisma.transportFeePlan.create({
      data: {
        institute_id: instId,
        name: `Monthly Fee — Route ${route.route_id}`,
        basis: 'route',
        route_id: route.route_id,
        amount: randomChoice([1200, 1500, 1800, 2000]),
        billing_cycle: 'monthly',
      },
    });
    feePlans.push(plan);
  }

  // ------------------------------------------------------------------
  // Passengers + Route Allocations + Fee Subscriptions + Payments
  // ------------------------------------------------------------------
  const PASSENGER_COUNT = 80;
  const names = [
    'Aarav', 'Vivaan', 'Aditya', 'Ishaan', 'Rohan', 'Ananya', 'Diya', 'Isha', 'Kavya', 'Riya',
    'Karthik', 'Nikhil', 'Varun', 'Sanjay', 'Deepak', 'Priya', 'Neha', 'Divya', 'Sneha', 'Pooja',
    'Rahul', 'Akash', 'Manish', 'Suresh', 'Ramesh', 'Lakshmi', 'Meena', 'Geeta', 'Sunita', 'Anita',
  ];

  // Month boundaries from May 2026 through October 2026 (partial), for monthly fee payments.
  const months: Array<{ start: Date; end: Date }> = [];
  for (let m = 4; m <= 9; m++) {
    const start = new Date(Date.UTC(2026, m, 1));
    const end = m === 9 ? TODAY : new Date(Date.UTC(2026, m + 1, 0));
    if (start.getTime() <= TODAY.getTime()) months.push({ start, end });
  }

  let paymentCount = 0;
  for (let i = 0; i < PASSENGER_COUNT; i++) {
    const type: 'student' | 'employee' = i < 65 ? 'student' : 'employee';
    const isActive = Math.random() > 0.08;
    const passenger = await prisma.transportPassenger.create({
      data: {
        institute_id: instId,
        external_ref_id: `${type === 'student' ? 'STU' : 'EMP'}-TR-${4000 + i}`,
        name: `${names[i % names.length]} ${type === 'student' ? 'Student' : 'Staff'}`,
        phone: `97${randomInt(10000000, 99999999)}`,
        type,
        status: isActive ? 'active' : 'inactive',
      },
    });

    const route = randomChoice(routes);
    const pickupStop = randomChoice(route.stopIds);
    const dropStop = randomChoice(route.stopIds);
    await prisma.transportPassengerRouteAllocation.create({
      data: {
        passenger_id: passenger.passenger_id,
        route_id: route.route_id,
        pickup_stop_id: pickupStop,
        drop_stop_id: dropStop,
        effective_from: RANGE_START,
        status: isActive ? 'active' : 'cancelled',
      },
    });

    const feePlan = feePlans[routes.findIndex((r) => r.route_id === route.route_id)] ?? randomChoice(feePlans);
    const subscriptionStatus: 'active' | 'cancelled' | 'expired' = isActive
      ? 'active'
      : randomChoice(['expired', 'cancelled']);
    const subscription = await prisma.transportPassengerFeeSubscription.create({
      data: {
        passenger_id: passenger.passenger_id,
        fee_plan_id: feePlan.fee_plan_id,
        start_date: RANGE_START,
        end_date: subscriptionStatus === 'active' ? null : addDays(TODAY, -randomInt(5, 60)),
        status: subscriptionStatus,
      },
    });

    for (const month of months) {
      // Skip a few months randomly to create "pending" realism, and stop
      // generating payments after a cancelled/expired subscription ends.
      if (Math.random() < 0.08) continue;

      const payDay = addDays(month.start, randomInt(0, Math.max(0, Math.min(27, Math.round((month.end.getTime() - month.start.getTime()) / 86400000)))));
      const isPastMonth = month.end.getTime() < TODAY.getTime();
      let status: 'success' | 'pending' | 'failed' | 'refunded' = 'success';
      if (!isPastMonth) {
        status = randomChoice(['success', 'pending', 'pending']);
      } else if (Math.random() < 0.05) {
        status = 'failed';
      }

      await prisma.transportFeePayment.create({
        data: {
          subscription_id: subscription.subscription_id,
          amount_paid: Number(feePlan.amount),
          payment_date: payDay,
          payment_mode: randomChoice(['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE']),
          status,
          invoice_id: `INV-${instId}-${subscription.subscription_id}-${month.start.getUTCMonth() + 1}`,
        },
      });
      paymentCount++;
    }
  }

  // ------------------------------------------------------------------
  // Vehicle Maintenance (some overdue — next_service_due_date in the past)
  // ------------------------------------------------------------------
  let maintenanceCount = 0;
  for (const vehicle of vehicles) {
    const serviceCount = randomInt(2, 3);
    for (let s = 0; s < serviceCount; s++) {
      const serviceDate = addDays(RANGE_START, randomInt(0, 150));
      const dueOffset = randomInt(-20, 90); // some overdue, some upcoming
      await prisma.transportVehicleMaintenance.create({
        data: {
          vehicle_id: vehicle.vehicle_id,
          service_date: serviceDate,
          service_type: randomChoice(['Oil Change', 'Brake Service', 'General Inspection', 'Tyre Replacement']),
          cost: randomInt(1500, 8000),
          next_service_due_km: randomInt(5000, 15000),
          next_service_due_date: addDays(serviceDate, dueOffset),
        },
      });
      maintenanceCount++;
    }
  }

  // ------------------------------------------------------------------
  // Geofence Alerts (mix resolved/unresolved)
  // ------------------------------------------------------------------
  const alertTypes: Array<'route_deviation' | 'speed_violation' | 'stop_delay' | 'sos'> = [
    'route_deviation',
    'speed_violation',
    'stop_delay',
    'sos',
  ];
  let alertCount = 0;
  for (let i = 0; i < 20; i++) {
    const vehicle = randomChoice(vehicles);
    const triggeredAt = addDays(TODAY, -randomInt(0, 60));
    await prisma.transportGeofenceAlert.create({
      data: {
        vehicle_id: vehicle.vehicle_id,
        alert_type: randomChoice(alertTypes),
        triggered_at: triggeredAt,
        resolved: Math.random() < 0.6,
      },
    });
    alertCount++;
  }

  console.log(
    `Transport seeded: ${vehicles.length} vehicles, ${routes.length} routes, ${drivers.length} drivers, ` +
      `${PASSENGER_COUNT} passengers, ${feePlans.length} fee plans, ${paymentCount} fee payments, ` +
      `${maintenanceCount} maintenance records, ${alertCount} geofence alerts ` +
      `(${RANGE_START.toISOString().slice(0, 10)} .. ${TODAY.toISOString().slice(0, 10)}).`,
  );
}
