import 'reflect-metadata';

// The receipt controller injects PdfService, whose Puppeteer dependency is ESM-only and not needed to inspect route metadata.
jest.mock('../pdf/pdf.service', () => ({ PdfService: class PdfService {} }));

import {
  ALUMNI_PERMISSIONS_KEY,
  ALUMNI_STAFF_ONLY_KEY,
} from './auth/require-permissions.decorator';
import type { AlumniPermissionRequirement } from './auth/require-permissions.decorator';
import {
  ALUMNI_RESOURCE_CATALOG,
  ALUMNI_SELF_SERVICE_RULES,
} from './roles-permissions/alumni-permission-catalog';
import { AlumniJwtGuard } from './auth/alumni-jwt.guard';
import { AlumniInstituteAdminViewOnlyGuard } from './auth/alumni-institute-admin-view-only.guard';
import { AlumniPermissionsGuard } from './auth/alumni-permissions.guard';
import {
  AlumniMeController,
  AlumniProfilesController,
  PublicDirectoryController,
} from './directory/alumni.controller';
import { EmploymentController } from './directory/employment.controller';
import { GroupsController } from './directory/groups.controller';
import {
  EventRegistrationsController,
  EventsController,
} from './events/events.controller';
import {
  JobApplicationsController,
  JobsController,
} from './jobs/jobs.controller';
import {
  MentorsController,
  MentorshipMatchesController,
  MentorshipProgramsController,
} from './mentorship/mentorship.controller';
import {
  CampaignsController,
  DonationsController,
  DonorHistoryController,
} from './fundraising/fundraising.controller';
import {
  CommunicationLogsController,
  NewslettersController,
} from './communication/communication.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { ReportsController } from './reports/reports.controller';
import { AlumniNotificationsController } from './notifications/alumni-notifications.controller';
import { AlumniAuthController } from './auth/alumni-auth.controller';
import { AlumniDynamicRolesController } from './roles-permissions/alumni-dynamic-roles.controller';
import { AlumniPermissionsRegistryController } from './roles-permissions/alumni-permissions-registry.controller';

/** Every controller that serves operational (permission-gated) data. */
const OPERATIONAL = [
  AlumniProfilesController,
  AlumniMeController,
  EmploymentController,
  GroupsController,
  EventsController,
  EventRegistrationsController,
  JobsController,
  JobApplicationsController,
  MentorshipProgramsController,
  MentorsController,
  MentorshipMatchesController,
  CampaignsController,
  DonationsController,
  DonorHistoryController,
  NewslettersController,
  CommunicationLogsController,
  DashboardController,
  ReportsController,
  AlumniNotificationsController,
];

interface Route {
  controller: string;
  handler: string;
  method: number;
  required: AlumniPermissionRequirement[] | undefined;
  staffOnly: boolean;
}

function routesOf(controller: new (...args: never[]) => unknown): Route[] {
  const proto = controller.prototype as Record<string, unknown>;
  const classStaffOnly =
    Reflect.getMetadata(ALUMNI_STAFF_ONLY_KEY, controller) === true;
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
      method: Reflect.getMetadata('method', proto[handler] as object) as number,
      required: Reflect.getMetadata(
        ALUMNI_PERMISSIONS_KEY,
        proto[handler] as object,
      ) as AlumniPermissionRequirement[] | undefined,
      staffOnly:
        classStaffOnly ||
        Reflect.getMetadata(ALUMNI_STAFF_ONLY_KEY, proto[handler] as object) ===
          true,
    }));
}

describe('Alumni RBAC wiring (own auth island, same shape as Admission / Hostel)', () => {
  const routes = OPERATIONAL.flatMap((c) => routesOf(c as never));
  const catalog = new Set(
    ALUMNI_RESOURCE_CATALOG.flatMap((r) =>
      r.available_actions.map((a) => `${r.resource}:${a}`),
    ),
  );

  it('discovers a realistic number of routes', () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it('every operational route is gated by @RequirePermission — none is left open to any logged-in user', () => {
    const open = routes.filter((r) => !r.required || r.required.length === 0);
    expect(open.map((r) => `${r.controller}.${r.handler}`)).toEqual([]);
  });

  it('every permission a route asks for exists in the seeded catalog', () => {
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
    // consulted in code, not on a route: recording a donation as received at creation time
    const inCode = new Set(['donations:confirm']);
    expect([...catalog].filter((p) => !used.has(p) && !inCode.has(p))).toEqual(
      [],
    );
  });

  it('every operational controller applies the full guard stack in order: Jwt → InstituteAdminViewOnly → Permissions', () => {
    for (const controller of OPERATIONAL) {
      const guards = Reflect.getMetadata('__guards__', controller) as unknown[];
      expect(guards).toEqual([
        AlumniJwtGuard,
        AlumniInstituteAdminViewOnlyGuard,
        AlumniPermissionsGuard,
      ]);
    }
  });

  it('the role-management controllers are guarded by the alumni JWT', () => {
    for (const controller of [
      AlumniDynamicRolesController,
      AlumniPermissionsRegistryController,
    ]) {
      expect(
        Reflect.getMetadata('__guards__', controller) as unknown[],
      ).toContain(AlumniJwtGuard);
    }
  });

  it('SSO, login and register are the only unauthenticated auth routes; the public directory is separate and read-only', () => {
    const proto = AlumniAuthController.prototype as unknown as Record<
      string,
      object
    >;
    const guarded = ['getMe', 'changePassword'].map(
      (h) => Reflect.getMetadata('__guards__', proto[h]) as unknown,
    );
    expect(guarded.every((g) => Array.isArray(g) && g.length > 0)).toBe(true);
    const open = ['ssoExchange', 'directLogin', 'register'].map(
      (h) => Reflect.getMetadata('__guards__', proto[h]) as unknown,
    );
    expect(open.every((g) => g === undefined)).toBe(true);
    const publicRoutes = routesOf(PublicDirectoryController);
    expect(publicRoutes).toHaveLength(1);
    // GET only (RequestMethod.GET === 0)
    expect(publicRoutes[0].method).toBe(0);
  });

  it('staff-only areas are closed to portal accounts: newsletters, communication, dashboard, reports, notifications', () => {
    for (const controller of [
      NewslettersController,
      CommunicationLogsController,
      DashboardController,
      ReportsController,
      AlumniNotificationsController,
    ]) {
      const cr = routesOf(controller);
      expect(cr.length).toBeGreaterThan(0);
      expect(cr.every((r) => r.staffOnly)).toBe(true);
    }
  });

  it('privileged actions are staff-only: verification, accounts, money movement, matching, event admin', () => {
    const staffOnly = (controller: string, handler: string) =>
      routes.find((r) => r.controller === controller && r.handler === handler)
        ?.staffOnly;
    expect(staffOnly('AlumniProfilesController', 'verify')).toBe(true);
    expect(staffOnly('AlumniProfilesController', 'reject')).toBe(true);
    expect(staffOnly('AlumniProfilesController', 'issueAccount')).toBe(true);
    expect(staffOnly('AlumniProfilesController', 'create')).toBe(true);
    expect(staffOnly('DonationsController', 'confirm')).toBe(true);
    expect(staffOnly('DonationsController', 'reverse')).toBe(true);
    expect(staffOnly('EventRegistrationsController', 'recordPayment')).toBe(
      true,
    );
    expect(staffOnly('EventsController', 'markAttendance')).toBe(true);
    expect(staffOnly('EventsController', 'attendees')).toBe(true);
    expect(staffOnly('EventsController', 'create')).toBe(true);
    expect(staffOnly('MentorshipProgramsController', 'createMatch')).toBe(true);
    expect(staffOnly('MentorshipMatchesController', 'updateStatus')).toBe(true);
    expect(staffOnly('CampaignsController', 'create')).toBe(true);
    expect(staffOnly('CampaignsController', 'statistics')).toBe(true);
    expect(staffOnly('GroupsController', 'addMembers')).toBe(true);
  });

  it('the self-service Alumni role only holds catalog permissions and nothing privileged', () => {
    for (const rule of ALUMNI_SELF_SERVICE_RULES) {
      for (const action of rule.actions) {
        expect(catalog.has(`${rule.resource}:${action}`)).toBe(true);
      }
    }
    const held = new Set(
      ALUMNI_SELF_SERVICE_RULES.flatMap((r) =>
        r.actions.map((a) => `${r.resource}:${a}`),
      ),
    );
    for (const forbidden of [
      'alumni:verify',
      'alumni:create',
      'alumni:delete',
      'alumni:issue_account',
      'alumni:export',
      'donations:confirm',
      'donations:reverse',
      'event_payments:create',
      'event_registrations:attendance',
      'newsletters:send',
      'newsletters:create',
      'reports:read',
      'reports:export',
      'dashboard:read',
      'campaigns:create',
      'events:create',
      'mentorship_matches:create',
      'communication:update',
    ]) {
      expect(held.has(forbidden)).toBe(false);
    }
  });
});
