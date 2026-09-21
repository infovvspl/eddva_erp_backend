import 'reflect-metadata';
import { HOSTEL_PERMISSIONS_KEY } from './auth/require-permissions.decorator';
import type { HostelPermissionRequirement } from './auth/require-permissions.decorator';
import { HOSTEL_RESOURCE_CATALOG } from './roles-permissions/hostel-permission-catalog';
import { HostelJwtGuard } from './auth/hostel-jwt.guard';
import { HostelInstituteAdminViewOnlyGuard } from './auth/hostel-institute-admin-view-only.guard';
import { HostelPermissionsGuard } from './auth/hostel-permissions.guard';
import { BlocksController } from './blocks/blocks.controller';
import { RoomsController } from './rooms/rooms.controller';
import { BedsController } from './rooms/beds.controller';
import { ResidentsController } from './residents/residents.controller';
import {
  AllotmentsController,
  TransferRequestsController,
} from './allotments/allotments.controller';
import { GatePassesController } from './gate-passes/gate-passes.controller';
import { AttendanceController } from './attendance/attendance.controller';
import { VisitorsController } from './visitors/visitors.controller';
import {
  MessAttendanceController,
  MessMenuController,
} from './mess/mess.controller';
import { ComplaintsController } from './complaints/complaints.controller';
import {
  FeePlansController,
  InvoicesController,
  PaymentsController,
} from './fees/fees.controller';
import { DisciplineController } from './discipline/discipline.controller';
import { AlertsController } from './alerts/alerts.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { ReportsController } from './reports/reports.controller';
import { HostelNotificationsController } from './notifications/hostel-notifications.controller';
import { HostelAuthController } from './auth/hostel-auth.controller';
import { HostelDynamicRolesController } from './roles-permissions/hostel-dynamic-roles.controller';
import { HostelPermissionsRegistryController } from './roles-permissions/hostel-permissions-registry.controller';

/** Every controller that serves operational (permission-gated) data. */
const OPERATIONAL = [
  BlocksController,
  RoomsController,
  BedsController,
  ResidentsController,
  AllotmentsController,
  TransferRequestsController,
  GatePassesController,
  AttendanceController,
  VisitorsController,
  MessMenuController,
  MessAttendanceController,
  ComplaintsController,
  FeePlansController,
  InvoicesController,
  PaymentsController,
  DisciplineController,
  AlertsController,
  DashboardController,
  ReportsController,
  HostelNotificationsController,
];

interface Route {
  controller: string;
  handler: string;
  required: HostelPermissionRequirement[] | undefined;
}

function routesOf(controller: new (...args: never[]) => unknown): Route[] {
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter(
      (name) => name !== 'constructor' && typeof proto[name] === 'function',
    )
    .filter(
      (name) =>
        Reflect.getMetadata('path', proto[name] as object) !== undefined,
    )
    .map((handler) => ({
      controller: controller.name,
      handler,
      required: Reflect.getMetadata(
        HOSTEL_PERMISSIONS_KEY,
        proto[handler] as object,
      ) as HostelPermissionRequirement[] | undefined,
    }));
}

describe('Hostel RBAC wiring (own auth island, same shape as Admission)', () => {
  const routes = OPERATIONAL.flatMap((c) => routesOf(c as never));
  const catalog = new Set(
    HOSTEL_RESOURCE_CATALOG.flatMap((r) =>
      r.available_actions.map((a) => `${r.resource}:${a}`),
    ),
  );

  it('discovers a realistic number of routes', () => {
    expect(routes.length).toBeGreaterThan(130);
  });

  it('every operational route is gated by @RequirePermission — none is left open to any logged-in user', () => {
    const open = routes.filter((r) => !r.required || r.required.length === 0);
    expect(open.map((r) => `${r.controller}.${r.handler}`)).toEqual([]);
  });

  it('every permission a route asks for exists in the seeded catalog (no typo can lock a route or leave it ungranted)', () => {
    const unknown = routes.flatMap((r) =>
      (r.required ?? [])
        .filter((p) => !catalog.has(`${p.resource}:${p.action}`))
        .map((p) => `${r.controller}.${r.handler} → ${p.resource}:${p.action}`),
    );
    expect(unknown).toEqual([]);
  });

  it('every catalog permission is used by at least one route (no dead permissions)', () => {
    const used = new Set(
      routes.flatMap((r) =>
        (r.required ?? []).map((p) => `${p.resource}:${p.action}`),
      ),
    );
    const unused = [...catalog].filter((p) => !used.has(p));
    // visitors:view_id is consulted in code (masking), not on a route
    expect(unused.filter((p) => p !== 'visitors:view_id')).toEqual([]);
  });

  it('every operational controller applies the full guard stack in order: Jwt → InstituteAdminViewOnly → Permissions', () => {
    for (const controller of OPERATIONAL) {
      const guards = Reflect.getMetadata('__guards__', controller) as unknown[];
      expect(guards).toEqual([
        HostelJwtGuard,
        HostelInstituteAdminViewOnlyGuard,
        HostelPermissionsGuard,
      ]);
    }
  });

  it('the auth + role-management controllers are guarded by the hostel JWT (and the SSO/login routes are the only public ones)', () => {
    for (const controller of [
      HostelDynamicRolesController,
      HostelPermissionsRegistryController,
    ]) {
      expect(Reflect.getMetadata('__guards__', controller)).toEqual([
        HostelJwtGuard,
      ]);
    }
    const authRoutes = routesOf(HostelAuthController);
    const publicOnes = authRoutes.filter(
      (r) =>
        !Reflect.getMetadata(
          '__guards__',
          (HostelAuthController.prototype as never)[r.handler],
        ),
    );
    expect(publicOnes.map((r) => r.handler).sort()).toEqual([
      'directLogin',
      'ssoExchange',
    ]);
  });

  it('least privilege: gate security needs only read+scan on gate passes and the visitor desk', () => {
    const scan = routes.filter((r) =>
      r.required?.some(
        (p) => p.resource === 'gate_passes' && p.action === 'scan',
      ),
    );
    expect(scan.map((r) => r.handler).sort()).toEqual([
      'scanIn',
      'scanInByNumber',
      'scanOut',
      'scanOutByNumber',
    ]);
  });

  it('scanning, approving and creating a pass are three separate permissions', () => {
    const only = (handler: string) =>
      routes.find(
        (r) => r.controller === 'GatePassesController' && r.handler === handler,
      )?.required?.[0];
    expect(only('scanOut')).toEqual({
      resource: 'gate_passes',
      action: 'scan',
    });
    expect(only('approve')).toEqual({
      resource: 'gate_passes',
      action: 'approve',
    });
    expect(only('create')).toEqual({
      resource: 'gate_passes',
      action: 'create',
    });
  });

  it('finance and discipline data sit behind their own resources, not behind generic hostel access', () => {
    const resourcesOf = (controller: string) =>
      new Set(
        routes
          .filter((r) => r.controller === controller)
          .flatMap((r) => (r.required ?? []).map((p) => p.resource)),
      );
    expect([...resourcesOf('PaymentsController')]).toEqual(['payments']);
    expect([...resourcesOf('FeePlansController')]).toEqual(['fee_plans']);
    expect([...resourcesOf('DisciplineController')]).toEqual(['discipline']);
  });

  it('the dashboard fee panel needs invoices:read as well as dashboard:read', () => {
    const fees = routes.find(
      (r) => r.controller === 'DashboardController' && r.handler === 'fees',
    );
    expect(fees?.required).toEqual([
      { resource: 'dashboard', action: 'read' },
      { resource: 'invoices', action: 'read' },
    ]);
  });
});
