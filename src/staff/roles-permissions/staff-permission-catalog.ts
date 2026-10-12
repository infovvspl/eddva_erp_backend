/**
 * Default permission catalog for the Staff module. Seeded into
 * `staff_permissions_catalog` on boot (idempotent). Each entry is a
 * `resource` with its available `actions`; roles hold `{resource, actions[]}`
 * rules, and controllers gate routes with @RequirePermission({resource, action}).
 *
 * Typical roles (created by the Institute Admin, not seeded):
 *  - HR Officer:      departments, staff_members (full), dashboard, reports
 *  - Department Head: staff_members (read on own department), dashboard (read)
 */
export interface ResourceDefinition {
  resource: string;
  name: string;
  description: string;
  available_actions: readonly string[];
}

export const STAFF_RESOURCE_CATALOG: readonly ResourceDefinition[] = [
  {
    resource: 'dashboard',
    name: 'Staff Dashboard',
    description: 'View staff dashboard statistics',
    available_actions: ['read'],
  },
  {
    resource: 'departments',
    name: 'Staff Departments',
    description: 'Manage staff departments',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'staff_members',
    name: 'Staff Directory',
    description:
      'Manage the staff directory (teaching and non-teaching); relieve and reinstate staff',
    available_actions: ['read', 'create', 'update', 'relieve', 'reinstate'],
  },
  {
    resource: 'leave_types',
    name: 'Leave Types',
    description: 'Manage leave type masters (quota, carry-forward rules, applicable staff type)',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'leave_balances',
    name: 'Leave Balances',
    description: 'View leave balances and trigger the annual accrual sync',
    available_actions: ['read', 'sync'],
  },
  {
    resource: 'leave_applications',
    name: 'Leave Applications',
    description: 'File, approve, reject and cancel staff leave applications',
    available_actions: ['read', 'create', 'approve', 'reject', 'cancel'],
  },
  {
    resource: 'notifications',
    name: 'Notification Log',
    description: 'View the staff notification outbox',
    available_actions: ['read'],
  },
  {
    resource: 'salary_structures',
    name: 'Salary Structures',
    description: 'Set and view staff salary structures (basic pay and allowances)',
    available_actions: ['read', 'create'],
  },
  {
    resource: 'payroll_runs',
    name: 'Payroll Runs',
    description: 'Generate, finalize and disburse monthly payroll runs',
    available_actions: ['read', 'create', 'finalize', 'pay'],
  },
];
