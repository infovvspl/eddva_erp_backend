/**
 * Default permission catalog for the Hostel module. Seeded into
 * `hostel_permissions_catalog` on boot (idempotent). Each entry is a
 * `resource` with its available `actions`; roles hold `{resource, actions[]}`
 * rules, and controllers gate routes with @RequirePermission({resource, action}).
 *
 * Typical roles (created by the Institute Admin, not seeded):
 *  - Warden:         residents, allotments, transfer_requests, gate_passes (read/approve),
 *                    attendance, visitors, mess_*, complaints, discipline, alerts, dashboard
 *  - Gate Security:  gate_passes (read/scan), visitors (read/create/checkout) — nothing else
 *  - Hostel Accountant: fee_plans, invoices, payments, reports
 */
export interface ResourceDefinition {
  resource: string;
  name: string;
  description: string;
  available_actions: readonly string[];
}

export const HOSTEL_RESOURCE_CATALOG: readonly ResourceDefinition[] = [
  {
    resource: 'dashboard',
    name: 'Hostel Dashboard',
    description: 'View hostel dashboard statistics',
    available_actions: ['read'],
  },
  {
    resource: 'blocks',
    name: 'Hostel Blocks',
    description: 'Manage hostel blocks, wardens and block occupancy',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'rooms',
    name: 'Rooms',
    description: 'Manage rooms, capacity and room status',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'beds',
    name: 'Beds',
    description: 'Manage bed-level tracking inside rooms',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'residents',
    name: 'Hostel Residents',
    description:
      'Register students as hostel residents; suspend, reinstate and re-admit them',
    available_actions: ['read', 'create', 'update', 'suspend'],
  },
  {
    resource: 'allotments',
    name: 'Room Allotments',
    description: 'Allot, vacate and transfer residents between rooms/beds',
    available_actions: ['read', 'create', 'vacate', 'transfer'],
  },
  {
    resource: 'transfer_requests',
    name: 'Room Transfer Requests',
    description: 'Raise, approve, reject and cancel room transfer requests',
    available_actions: ['read', 'create', 'approve', 'cancel'],
  },
  {
    resource: 'gate_passes',
    name: 'Gate Passes',
    description:
      'Request and approve gate passes; gate-verify residents out and back in',
    available_actions: ['read', 'create', 'approve', 'scan', 'cancel'],
  },
  {
    resource: 'attendance',
    name: 'Hostel Attendance',
    description: 'Morning/night roll call attendance',
    available_actions: ['read', 'mark', 'update'],
  },
  {
    resource: 'visitors',
    name: 'Visitor Log',
    description:
      'Record and check out visitors. view_id reveals the full ID proof number',
    available_actions: ['read', 'create', 'checkout', 'view_id'],
  },
  {
    resource: 'mess_menu',
    name: 'Mess Menu',
    description: 'Manage the weekly mess menu',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'mess_attendance',
    name: 'Mess Attendance',
    description: 'Meal opt-in/opt-out and consumption tracking',
    available_actions: ['read', 'mark', 'update'],
  },
  {
    resource: 'complaints',
    name: 'Hostel Complaints & Maintenance',
    description: 'Raise, assign, progress, resolve and close complaints',
    available_actions: [
      'read',
      'create',
      'update',
      'assign',
      'resolve',
      'close',
    ],
  },
  {
    resource: 'fee_plans',
    name: 'Hostel Fee Plans',
    description: 'Manage room-type fee plans',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'invoices',
    name: 'Hostel Fee Invoices',
    description: 'Generate and cancel resident fee invoices',
    available_actions: ['read', 'create', 'cancel'],
  },
  {
    resource: 'payments',
    name: 'Hostel Fee Payments',
    description: 'Record and view fee payments and receipts',
    available_actions: ['read', 'create'],
  },
  {
    resource: 'discipline',
    name: 'Discipline Records',
    description: 'Record and view resident discipline incidents',
    available_actions: ['read', 'create', 'link'],
  },
  {
    resource: 'alerts',
    name: 'Hostel Alerts',
    description: 'View overdue-pass and unaccounted-absence alerts',
    available_actions: ['read'],
  },
  {
    resource: 'reports',
    name: 'Hostel Reports',
    description: 'Run and export hostel reports',
    available_actions: ['read', 'export'],
  },
  {
    resource: 'notifications',
    name: 'Notification Log',
    description: 'View the hostel notification outbox',
    available_actions: ['read'],
  },
];
